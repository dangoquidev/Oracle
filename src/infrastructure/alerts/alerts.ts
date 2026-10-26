import type { Clock } from '../../application/ports/clock.js';

export type AlertLevel = 'error' | 'warning' | 'recovery' | 'info';

export interface Alert {
  readonly level: AlertLevel;
  readonly title: string;
  readonly details: Readonly<Record<string, string>>;
  /** Occurrences of the same alert that were held back since the last one sent. */
  readonly suppressed?: number;
}

export interface AlertSink {
  send(alert: Alert): Promise<void>;
}

const DEFAULT_WINDOW_MS = 30 * 60_000;

/**
 * Sends alerts without flooding the channel: the same alert (by key) goes out at most once per
 * window, the next one reporting how many were held back. Sending never throws.
 */
export class AlertDispatcher {
  private readonly lastSent = new Map<string, { at: number; suppressed: number }>();
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly sink: AlertSink,
    private readonly clock: Clock,
    private readonly windowMs = DEFAULT_WINDOW_MS,
  ) {}

  /** Returns false when the alert was held back. */
  dispatch(key: string, alert: Alert): boolean {
    const now = this.clock.now().getTime();
    const previous = this.lastSent.get(key);
    if (previous && now - previous.at < this.windowMs) {
      previous.suppressed += 1;
      return false;
    }
    this.lastSent.set(key, { at: now, suppressed: 0 });
    const suppressed = previous?.suppressed ?? 0;
    const sending = this.sink
      .send(suppressed > 0 ? { ...alert, suppressed } : alert)
      .catch(() => undefined)
      .finally(() => this.pending.delete(sending));
    this.pending.add(sending);
    return true;
  }

  /** Waits for alerts still being sent (before exiting), at most `timeoutMs`. */
  async flush(timeoutMs = 5_000): Promise<void> {
    await Promise.race([
      Promise.allSettled([...this.pending]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
    ]);
  }
}
