import { hostname } from 'node:os';
import type { Logger } from '../../application/ports/logger.js';
import type { Alert, AlertLevel, AlertSink } from './alerts.js';

const COLORS: Record<AlertLevel, number> = {
  error: 0xed4245,
  warning: 0xf0b232,
  recovery: 0x57f287,
  info: 0x5865f2,
};
const ICONS: Record<AlertLevel, string> = { error: '🔴', warning: '🟠', recovery: '🟢', info: 'ℹ️' };
const MAX_FIELDS = 10;
const TIMEOUT_MS = 10_000;

/** Posts alerts to a Discord webhook as embeds. */
export class DiscordWebhookSink implements AlertSink {
  constructor(
    private readonly url: string,
    private readonly mentionUserId: string | null,
    private readonly logger: Logger,
    private readonly host = hostname(),
  ) {}

  async send(alert: Alert): Promise<void> {
    const mention = alert.level === 'error' && this.mentionUserId ? this.mentionUserId : null;
    const fields = Object.entries(alert.details)
      .slice(0, MAX_FIELDS)
      .map(([name, value]) => ({
        name,
        value: name === 'stack' ? `\`\`\`\n${value}\n\`\`\`` : value,
        inline: name !== 'stack' && name !== 'error' && value.length <= 40,
      }));
    const body = {
      username: 'Oracle alerts',
      content: mention ? `<@${mention}>` : undefined,
      allowed_mentions: { users: mention ? [mention] : [] },
      embeds: [
        {
          title: `${ICONS[alert.level]} ${alert.title}`.slice(0, 256),
          color: COLORS[alert.level],
          fields,
          footer: {
            text: alert.suppressed
              ? `${this.host} · +${alert.suppressed} similar since the last alert`
              : this.host,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) this.logger.warn({ status: response.status }, 'Alert webhook rejected the alert');
    } catch (error) {
      // Logged as a warning on purpose: an error would trigger another alert.
      this.logger.warn({ err: error }, 'Alert webhook unreachable');
    }
  }
}
