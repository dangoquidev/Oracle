import type { Logger } from '../../application/ports/logger.js';

export const LEAGUEPEDIA_API_URL = 'https://lol.fandom.com/api.php';
const CARGO_PAGE_SIZE = 500;

export interface LeaguepediaClientOptions {
  readonly credentials: { readonly username: string; readonly password: string };
  readonly userAgent: string;
  /** Minimum delay between two requests; Fandom rate-limits Cargo aggressively. */
  readonly minIntervalMs: number;
  readonly logger: Logger;
  readonly maxRetries?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly apiUrl?: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly random?: () => number;
}

export interface CargoQuery {
  readonly tables: string;
  readonly fields: string;
  readonly where?: string;
  readonly joinOn?: string;
  readonly orderBy?: string;
}

export type CargoRow = Record<string, string | null | undefined>;

export class LeaguepediaError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'LeaguepediaError';
  }
}

interface ApiError {
  readonly code: string;
  readonly info?: string;
}

const RETRYABLE_ERROR_CODES = new Set([
  'ratelimited',
  'maxlag',
  'readonly',
  'internal_api_error_DBQueryError',
]);
const SESSION_ERROR_CODES = new Set(['assertuserfailed', 'assertbotfailed']);

/**
 * Minimal MediaWiki API client for Leaguepedia: one request at a time, spaced by `minIntervalMs`,
 * logged in with a Bot Password (anonymous Cargo queries are rate-limited to death),
 * exponential backoff on rate limits and transient failures.
 */
export class LeaguepediaClient {
  private readonly cookies = new Map<string, string>();
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly apiUrl: string;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private loggedIn = false;
  /** Login in progress, shared by requests started meanwhile (a second login would be refused). */
  private pendingLogin: Promise<void> | null = null;

  constructor(private readonly options: LeaguepediaClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.maxRetries = options.maxRetries ?? 5;
    this.baseBackoffMs = options.baseBackoffMs ?? 30_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 300_000;
    this.apiUrl = options.apiUrl ?? LEAGUEPEDIA_API_URL;
  }

  /** Runs a Cargo query and follows pagination until every row is fetched. */
  async cargoQuery(query: CargoQuery): Promise<CargoRow[]> {
    const rows: CargoRow[] = [];
    for (let offset = 0; ; offset += CARGO_PAGE_SIZE) {
      const response = await this.call({
        action: 'cargoquery',
        tables: query.tables,
        fields: query.fields,
        ...(query.where ? { where: query.where } : {}),
        ...(query.joinOn ? { join_on: query.joinOn } : {}),
        ...(query.orderBy ? { order_by: query.orderBy } : {}),
        limit: String(CARGO_PAGE_SIZE),
        offset: String(offset),
      });
      const page = parseCargoRows(response);
      rows.push(...page);
      if (page.length < CARGO_PAGE_SIZE) return rows;
    }
  }

  /** Plain `action=query` request (page info, image info…). */
  async query(params: Record<string, string>): Promise<unknown> {
    return this.call({ action: 'query', ...params });
  }

  private async call(params: Record<string, string>): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        if (!this.loggedIn) await this.ensureLoggedIn();
        const response = await this.send('GET', { ...params, assert: 'user' });
        const error = apiErrorOf(response);
        if (!error) return response;
        if (SESSION_ERROR_CODES.has(error.code)) {
          this.loggedIn = false;
          throw new LeaguepediaError('Session expired', error.code);
        }
        throw new LeaguepediaError(error.info ?? error.code, error.code);
      } catch (error) {
        if (!this.isRetryable(error) || attempt >= this.maxRetries) throw error;
        const delay = this.backoffDelay(attempt, error);
        this.options.logger.warn(
          { attempt: attempt + 1, delayMs: delay, err: error },
          'Leaguepedia request failed, retrying',
        );
        await this.sleep(delay);
      }
    }
  }

  private ensureLoggedIn(): Promise<void> {
    this.pendingLogin ??= this.login().finally(() => {
      this.pendingLogin = null;
    });
    return this.pendingLogin;
  }

  private async login(): Promise<void> {
    this.cookies.clear();
    const tokenResponse = await this.send('GET', { action: 'query', meta: 'tokens', type: 'login' });
    const token = loginTokenOf(tokenResponse);
    const response = await this.send('POST', {
      action: 'login',
      lgname: this.options.credentials.username,
      lgpassword: this.options.credentials.password,
      lgtoken: token,
    });
    const result = loginResultOf(response);
    if (result.result !== 'Success') {
      throw new LeaguepediaError(
        `Leaguepedia login failed: ${result.reason ?? result.result}`,
        'login-failed',
      );
    }
    this.loggedIn = true;
    this.options.logger.info({}, 'Logged in to Leaguepedia');
  }

  /** Queues one HTTP request so that requests never overlap and stay spaced. */
  private send(method: 'GET' | 'POST', params: Record<string, string>): Promise<unknown> {
    const run = async (): Promise<unknown> => {
      const wait = this.lastRequestAt + this.options.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();
      return this.performRequest(method, params);
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async performRequest(method: 'GET' | 'POST', params: Record<string, string>): Promise<unknown> {
    const body = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    const headers: Record<string, string> = {
      'User-Agent': this.options.userAgent,
      'Accept-Encoding': 'gzip',
    };
    if (this.cookies.size > 0)
      headers.Cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const response = await this.fetch(method === 'GET' ? `${this.apiUrl}?${body.toString()}` : this.apiUrl, {
      method,
      headers,
      ...(method === 'POST' ? { body } : {}),
    });
    this.storeCookies(response.headers);

    if (!response.ok) {
      throw new LeaguepediaError(
        `HTTP ${response.status}`,
        response.status === 429 ? 'ratelimited' : `http-${response.status}`,
      );
    }
    return response.json();
  }

  private storeCookies(headers: Headers): void {
    for (const cookie of headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof LeaguepediaError)) return error instanceof TypeError; // fetch network failure
    if (error.code === undefined) return false;
    return (
      RETRYABLE_ERROR_CODES.has(error.code) ||
      SESSION_ERROR_CODES.has(error.code) ||
      /^http-5\d\d$/.test(error.code)
    );
  }

  private backoffDelay(attempt: number, error: unknown): number {
    if (error instanceof LeaguepediaError && error.code !== undefined && SESSION_ERROR_CODES.has(error.code))
      return 0;
    const exponential = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** attempt);
    return Math.round(exponential * (0.5 + this.random() / 2));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function apiErrorOf(response: unknown): ApiError | null {
  if (!isRecord(response) || !isRecord(response.error) || typeof response.error.code !== 'string')
    return null;
  const info = response.error.info;
  return { code: response.error.code, ...(typeof info === 'string' ? { info } : {}) };
}

function loginTokenOf(response: unknown): string {
  const query = isRecord(response) ? response.query : undefined;
  const tokens = isRecord(query) ? query.tokens : undefined;
  const token = isRecord(tokens) ? tokens.logintoken : undefined;
  if (typeof token !== 'string') throw new LeaguepediaError('No login token in response', 'login-failed');
  return token;
}

function loginResultOf(response: unknown): { result: string; reason?: string } {
  const login = isRecord(response) ? response.login : undefined;
  if (!isRecord(login) || typeof login.result !== 'string') return { result: 'Unknown' };
  const reason = login.reason;
  return { result: login.result, ...(typeof reason === 'string' ? { reason } : {}) };
}

function parseCargoRows(response: unknown): CargoRow[] {
  const rows = isRecord(response) ? response.cargoquery : undefined;
  if (!Array.isArray(rows)) throw new LeaguepediaError('Unexpected Cargo response shape', 'bad-response');
  return rows.map((row: unknown) => {
    const title = isRecord(row) ? row.title : undefined;
    return isRecord(title) ? (title as CargoRow) : {};
  });
}
