import { pino } from 'pino';
import type { Logger } from '../../application/ports/logger.js';

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    base: { service: 'pronobot' },
    redact: { paths: ['*.password', '*.token', '*.lgpassword'], censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } } : {}),
  });
}
