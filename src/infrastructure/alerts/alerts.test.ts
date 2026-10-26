import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, SilentLogger } from '../../test-support/fakes.js';
import { HealthWatchdog } from '../health/health-watchdog.js';
import { alertDetails, AlertingLogger } from './alerting-logger.js';
import { AlertDispatcher, type Alert, type AlertSink } from './alerts.js';
import { DiscordWebhookSink } from './discord-webhook-sink.js';

class RecordingSink implements AlertSink {
  readonly sent: Alert[] = [];
  fail = false;
  send(alert: Alert): Promise<void> {
    if (this.fail) return Promise.reject(new Error('down'));
    this.sent.push(alert);
    return Promise.resolve();
  }
}

describe('AlertDispatcher', () => {
  let sink: RecordingSink;
  let clock: FixedClock;
  let alerts: AlertDispatcher;
  const alert: Alert = { level: 'error', title: 'Job failed', details: {} };

  beforeEach(() => {
    sink = new RecordingSink();
    clock = new FixedClock(new Date('2026-10-26T10:00:00Z'));
    alerts = new AlertDispatcher(sink, clock, 30 * 60_000);
  });

  it('sends the same alert once per window and counts the ones held back', async () => {
    expect(alerts.dispatch('job', alert)).toBe(true);
    expect(alerts.dispatch('job', alert)).toBe(false);
    expect(alerts.dispatch('job', alert)).toBe(false);
    expect(alerts.dispatch('other', alert)).toBe(true);
    clock.set(new Date('2026-10-26T10:31:00Z'));
    expect(alerts.dispatch('job', alert)).toBe(true);
    await alerts.flush();
    expect(sink.sent.map((sent) => sent.suppressed)).toEqual([undefined, undefined, 2]);
  });

  it('never throws when the sink fails', async () => {
    sink.fail = true;
    expect(alerts.dispatch('job', alert)).toBe(true);
    await expect(alerts.flush()).resolves.toBeUndefined();
  });
});

describe('AlertingLogger', () => {
  it('turns error logs into alerts, with child bindings', async () => {
    const sink = new RecordingSink();
    const alerts = new AlertDispatcher(sink, new FixedClock(new Date()));
    const logger = new AlertingLogger(new SilentLogger(), alerts).child({ module: 'scheduler' });
    logger.info({}, 'Job done');
    logger.warn({}, 'Slow');
    logger.error({ job: 'schedule-sync', err: new Error('boom') }, 'Job failed');
    await alerts.flush();
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]).toMatchObject({
      level: 'error',
      title: 'Job failed',
      details: { module: 'scheduler', job: 'schedule-sync', error: 'boom' },
    });
    expect(sink.sent[0]?.details.stack).toContain('alerts.test.ts');
  });

  it('keeps plain fields and describes any error', () => {
    const coded = Object.assign(new Error('Missing Access'), { code: 50001 });
    expect(alertDetails({ guildId: 'g1', count: 3, nested: { secret: 'x' }, err: coded })).toMatchObject({
      guildId: 'g1',
      count: '3',
      error: 'Missing Access (50001)',
    });
    expect(alertDetails({ err: 'plain' })).toEqual({ error: 'plain' });
    expect(alertDetails({ err: { reason: 'odd' } }).error).toContain('odd');
    expect(alertDetails({ text: 'x'.repeat(2000) }).text).toHaveLength(900);
  });
});

describe('DiscordWebhookSink', () => {
  let received: { body: unknown; headers: IncomingMessage['headers'] }[];
  let status: number;
  let url: string;
  let close: () => void;

  beforeEach(async () => {
    received = [];
    status = 204;
    const server = createServer((request, response) => {
      let data = '';
      request.on('data', (chunk: Buffer) => (data += chunk.toString()));
      request.on('end', () => {
        received.push({ body: JSON.parse(data) as unknown, headers: request.headers });
        response.writeHead(status).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    close = () => server.close();
  });
  afterEach(() => {
    close();
  });

  it('posts an embed and pings the configured user on errors only', async () => {
    const sink = new DiscordWebhookSink(url, '42', new SilentLogger(), 'vps-1');
    await sink.send({
      level: 'error',
      title: 'Job failed',
      details: { job: 'results-poll', stack: 'at x' },
      suppressed: 3,
    });
    await sink.send({ level: 'recovery', title: 'Back', details: {} });
    expect(received[0]?.body).toMatchObject({
      content: '<@42>',
      allowed_mentions: { users: ['42'] },
      embeds: [
        {
          title: '🔴 Job failed',
          color: 0xed4245,
          fields: [
            { name: 'job', value: 'results-poll', inline: true },
            { name: 'stack', value: '```\nat x\n```', inline: false },
          ],
          footer: { text: 'vps-1 · +3 similar since the last alert' },
        },
      ],
    });
    expect(received[1]?.body).toMatchObject({
      allowed_mentions: { users: [] },
      embeds: [{ title: '🟢 Back' }],
    });
    expect(received[1]?.body).not.toHaveProperty('content');
  });

  it('only warns when the webhook fails', async () => {
    status = 404;
    const logger = new SilentLogger();
    await new DiscordWebhookSink(url, null, logger).send({ level: 'info', title: 'Hi', details: {} });
    await new DiscordWebhookSink('http://127.0.0.1:1/none', null, logger).send({
      level: 'info',
      title: 'Hi',
      details: {},
    });
    expect(logger.entries.map((entry) => [entry.level, entry.message])).toEqual([
      ['warn', 'Alert webhook rejected the alert'],
      ['warn', 'Alert webhook unreachable'],
    ]);
  });
});

describe('HealthWatchdog', () => {
  it('alerts after the grace period, once, then on recovery', async () => {
    const sink = new RecordingSink();
    const clock = new FixedClock(new Date('2026-10-26T10:00:00Z'));
    const alerts = new AlertDispatcher(sink, clock);
    let discord = false;
    const watchdog = new HealthWatchdog(
      { discord: () => discord, database: () => true },
      alerts,
      clock,
      5 * 60_000,
    );

    await watchdog.check();
    clock.set(new Date('2026-10-26T10:04:00Z'));
    await watchdog.check();
    expect(sink.sent).toEqual([]);

    clock.set(new Date('2026-10-26T10:06:00Z'));
    await watchdog.check();
    clock.set(new Date('2026-10-26T10:07:00Z'));
    await watchdog.check();
    discord = true;
    clock.set(new Date('2026-10-26T11:20:00Z'));
    await watchdog.check();
    await watchdog.check();
    await alerts.flush();

    expect(sink.sent.map((alert) => [alert.level, alert.title, alert.details])).toEqual([
      ['error', 'Health checks failing', { failing: 'discord', since: '6 min' }],
      ['recovery', 'Health checks passing again', { down: '1 h 20 min' }],
    ]);
  });

  it('forgets short outages', async () => {
    const sink = new RecordingSink();
    const clock = new FixedClock(new Date('2026-10-26T10:00:00Z'));
    let healthy = false;
    const watchdog = new HealthWatchdog({ discord: () => healthy }, new AlertDispatcher(sink, clock), clock);
    await watchdog.check();
    healthy = true;
    await watchdog.check();
    healthy = false;
    clock.set(new Date('2026-10-26T10:04:00Z'));
    await watchdog.check();
    expect(sink.sent).toEqual([]);
  });
});
