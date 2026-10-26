import { inspect } from 'node:util';
import type { Logger } from '../../application/ports/logger.js';
import type { AlertDispatcher } from './alerts.js';

const MAX_VALUE_LENGTH = 900;
const STACK_LINES = 6;

/** Logger that also turns every error log into an operator alert. */
export class AlertingLogger implements Logger {
  constructor(
    private readonly inner: Logger,
    private readonly alerts: AlertDispatcher,
    private readonly bindings: Readonly<Record<string, unknown>> = {},
  ) {}

  debug(context: object, message: string): void {
    this.inner.debug(context, message);
  }

  info(context: object, message: string): void {
    this.inner.info(context, message);
  }

  warn(context: object, message: string): void {
    this.inner.warn(context, message);
  }

  error(context: object, message: string): void {
    this.inner.error(context, message);
    this.alerts.dispatch(`error:${message}`, {
      level: 'error',
      title: message,
      details: alertDetails({ ...this.bindings, ...context }),
    });
  }

  child(bindings: object): Logger {
    return new AlertingLogger(this.inner.child(bindings), this.alerts, { ...this.bindings, ...bindings });
  }
}

/** Plain fields of a log context, with the error message and the top of its stack. */
export function alertDetails(context: Readonly<Record<string, unknown>>): Record<string, string> {
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (key === 'err') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      details[key] = truncate(String(value));
    }
  }
  const error = context.err;
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    details.error = truncate(
      typeof code === 'string' || typeof code === 'number' ? `${error.message} (${code})` : error.message,
    );
    if (error.stack)
      details.stack = truncate(
        error.stack
          .split('\n')
          .slice(1, STACK_LINES + 1)
          .join('\n'),
      );
  } else if (error !== undefined) {
    details.error = truncate(typeof error === 'string' ? error : inspect(error, { depth: 2 }));
  }
  return details;
}

function truncate(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH - 1)}…` : value;
}
