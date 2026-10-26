import type { Clock } from '../../application/ports/clock.js';
import type { AlertDispatcher } from '../alerts/alerts.js';
import { evaluateChecks, type HealthCheck } from './health-server.js';

const DEFAULT_GRACE_MS = 5 * 60_000;
const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Alerts when a health check keeps failing (Discord disconnected, database unreachable) beyond a
 * grace period that absorbs normal reconnections, and again once everything is back.
 */
export class HealthWatchdog {
  private failingSince: number | null = null;
  private alerted = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly checks: Record<string, HealthCheck>,
    private readonly alerts: AlertDispatcher,
    private readonly clock: Clock,
    private readonly graceMs = DEFAULT_GRACE_MS,
  ) {}

  start(intervalMs = DEFAULT_INTERVAL_MS): void {
    this.timer = setInterval(() => void this.check(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async check(): Promise<void> {
    const results = await evaluateChecks(this.checks);
    const failing = Object.keys(results).filter((name) => !results[name]);
    const now = this.clock.now().getTime();

    if (failing.length === 0) {
      if (this.alerted) {
        this.alerts.dispatch(`health:recovered:${now}`, {
          level: 'recovery',
          title: 'Health checks passing again',
          details: { down: formatDuration(now - (this.failingSince ?? now)) },
        });
      }
      this.failingSince = null;
      this.alerted = false;
      return;
    }

    this.failingSince ??= now;
    if (!this.alerted && now - this.failingSince >= this.graceMs) {
      this.alerted = true;
      this.alerts.dispatch(`health:failing:${now}`, {
        level: 'error',
        title: 'Health checks failing',
        details: { failing: failing.join(', '), since: formatDuration(now - this.failingSince) },
      });
    }
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
