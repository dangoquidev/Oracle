import { beforeEach, describe, expect, it } from 'vitest';
import { SilentLogger } from '../../test-support/fakes.js';
import { LeaguepediaClient, LeaguepediaError } from './leaguepedia-client.js';

type Handler = (params: URLSearchParams, init: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

class FakeApi {
  readonly calls: { method: string; params: URLSearchParams; cookie: string | null }[] = [];
  cargo: Handler = () => json({ cargoquery: [] });
  query: Handler = () => json({ query: {} });
  loginResult = 'Success';
  loginCount = 0;

  readonly fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? 'GET';
    const params =
      method === 'POST'
        ? new URLSearchParams(init.body as URLSearchParams)
        : new URL(input instanceof Request ? input.url : input.toString()).searchParams;
    const headers = new Headers(init.headers);
    this.calls.push({ method, params, cookie: headers.get('cookie') });

    const action = params.get('action');
    if (action === 'query' && params.get('meta') === 'tokens') {
      return json(
        { query: { tokens: { logintoken: 'tok+\\' } } },
        { headers: { 'set-cookie': 'session=abc; path=/' } },
      );
    }
    if (action === 'login') {
      this.loginCount++;
      return json({ login: { result: this.loginResult, reason: 'bad password' } });
    }
    if (action === 'cargoquery') return this.cargo(params, init);
    return this.query(params, init);
  };
}

const rows = (count: number, from = 0) => ({
  cargoquery: Array.from({ length: count }, (_, i) => ({ title: { N: String(from + i) } })),
});

describe('LeaguepediaClient', () => {
  let api: FakeApi;
  let sleeps: number[];
  let clock: number;
  let logger: SilentLogger;

  const client = (overrides: Partial<ConstructorParameters<typeof LeaguepediaClient>[0]> = {}) =>
    new LeaguepediaClient({
      credentials: { username: 'User@bot', password: 'secret' },
      userAgent: 'PronoBot/test',
      minIntervalMs: 1000,
      logger,
      fetch: api.fetch,
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
      random: () => 1,
      baseBackoffMs: 100,
      maxBackoffMs: 1000,
      maxRetries: 3,
      ...overrides,
    });

  beforeEach(() => {
    api = new FakeApi();
    sleeps = [];
    clock = 0;
    logger = new SilentLogger();
  });

  it('logs in with the bot password before querying, then reuses the session cookie', async () => {
    api.cargo = () => json(rows(2));
    const result = await client().cargoQuery({ tables: 'T', fields: 'N' });

    expect(result).toEqual([{ N: '0' }, { N: '1' }]);
    const [token, login, query] = api.calls;
    expect(token?.params.get('type')).toBe('login');
    expect(login?.method).toBe('POST');
    expect(login?.params.get('lgname')).toBe('User@bot');
    expect(login?.params.get('lgtoken')).toBe('tok+\\');
    expect(login?.cookie).toBe('session=abc');
    expect(query?.params.get('assert')).toBe('user');
    expect(query?.params.get('limit')).toBe('500');
  });

  it('logs in once for requests started together', async () => {
    // Two jobs starting at boot: a second login on the fresh session would be refused by MediaWiki.
    const leaguepedia = client();
    await Promise.all([
      leaguepedia.cargoQuery({ tables: 'A', fields: 'x' }),
      leaguepedia.cargoQuery({ tables: 'B', fields: 'y' }),
    ]);
    expect(api.loginCount).toBe(1);
    expect(api.calls.filter((call) => call.params.get('meta') === 'tokens')).toHaveLength(1);
    expect(api.calls.filter((call) => call.params.get('action') === 'cargoquery')).toHaveLength(2);
  });

  it('passes optional query clauses', async () => {
    await client().cargoQuery({ tables: 'T', fields: 'N', where: "a='b'", joinOn: 'x=y', orderBy: 'N' });
    const query = api.calls.at(-1)?.params;
    expect([query?.get('where'), query?.get('join_on'), query?.get('order_by')]).toEqual([
      "a='b'",
      'x=y',
      'N',
    ]);
  });

  it('follows pagination', async () => {
    api.cargo = (params) => json(params.get('offset') === '0' ? rows(500) : rows(3, 500));
    const result = await client().cargoQuery({ tables: 'T', fields: 'N' });
    expect(result).toHaveLength(503);
  });

  it('spaces requests by the minimum interval', async () => {
    await client().cargoQuery({ tables: 'T', fields: 'N' });
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('backs off exponentially when rate limited', async () => {
    let attempts = 0;
    api.cargo = () =>
      ++attempts < 3 ? json({ error: { code: 'ratelimited', info: 'slow down' } }) : json(rows(1));
    const result = await client({ minIntervalMs: 0 }).cargoQuery({ tables: 'T', fields: 'N' });
    expect(result).toHaveLength(1);
    expect(sleeps).toEqual([100, 200]);
    expect(logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(2);
  });

  it('treats HTTP 429 and 5xx as transient', async () => {
    const statuses = [429, 503];
    api.cargo = () => {
      const status = statuses.shift();
      return status ? new Response('busy', { status }) : json(rows(1));
    };
    expect(await client({ minIntervalMs: 0 }).cargoQuery({ tables: 'T', fields: 'N' })).toHaveLength(1);
  });

  it('retries network failures', async () => {
    let failed = false;
    api.cargo = () => {
      if (failed) return json(rows(1));
      failed = true;
      throw new TypeError('fetch failed');
    };
    expect(await client({ minIntervalMs: 0 }).cargoQuery({ tables: 'T', fields: 'N' })).toHaveLength(1);
  });

  it('gives up after the maximum number of retries', async () => {
    api.cargo = () => json({ error: { code: 'ratelimited' } });
    await expect(client({ minIntervalMs: 0 }).cargoQuery({ tables: 'T', fields: 'N' })).rejects.toMatchObject(
      {
        code: 'ratelimited',
      },
    );
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it('logs in again when the session expired', async () => {
    let expired = true;
    api.cargo = () => {
      if (!expired) return json(rows(1));
      expired = false;
      return json({ error: { code: 'assertuserfailed' } });
    };
    expect(await client({ minIntervalMs: 0 }).cargoQuery({ tables: 'T', fields: 'N' })).toHaveLength(1);
    expect(api.loginCount).toBe(2);
    expect(sleeps).toEqual([0]);
  });

  it('fails fast on rejected credentials', async () => {
    api.loginResult = 'Failed';
    await expect(client().cargoQuery({ tables: 'T', fields: 'N' })).rejects.toThrow(
      'Leaguepedia login failed: bad password',
    );
  });

  it('fails fast on non transient API errors and odd responses', async () => {
    api.cargo = () => json({ error: { code: 'badparams', info: 'nope' } });
    await expect(client().cargoQuery({ tables: 'T', fields: 'N' })).rejects.toThrow(LeaguepediaError);

    api.cargo = () => json({ unexpected: true });
    await expect(client().cargoQuery({ tables: 'T', fields: 'N' })).rejects.toThrow(
      'Unexpected Cargo response shape',
    );

    api.cargo = () => new Response('missing', { status: 404 });
    await expect(client().cargoQuery({ tables: 'T', fields: 'N' })).rejects.toThrow('HTTP 404');
  });

  it('runs plain queries through the same session', async () => {
    api.query = (params) => json({ query: { echoed: params.get('prop') } });
    expect(await client().query({ prop: 'imageinfo' })).toEqual({ query: { echoed: 'imageinfo' } });
  });
});
