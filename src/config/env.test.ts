import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const valid = {
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '123',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  LEAGUEPEDIA_BOT_USER: 'User@bot',
  LEAGUEPEDIA_BOT_PASSWORD: 'secret',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env).toMatchObject({ LOG_LEVEL: 'info', HEALTH_PORT: 3000, LEAGUEPEDIA_MIN_INTERVAL_MS: 8000 });
    expect(env.EMOJI_GUILD_IDS).toEqual([]);
  });

  it('parses comma separated emoji servers', () => {
    expect(loadEnv({ ...valid, EMOJI_GUILD_IDS: ' 1, 2 ,' }).EMOJI_GUILD_IDS).toEqual(['1', '2']);
  });

  it('reports every invalid variable', () => {
    expect(() => loadEnv({ ...valid, DISCORD_TOKEN: '', DATABASE_URL: 'nope' })).toThrow(
      /DISCORD_TOKEN[\s\S]*DATABASE_URL/,
    );
  });

  it('keeps alerts optional and only accepts https webhooks', () => {
    expect(loadEnv({ ...valid, ALERT_WEBHOOK_URL: '', ALERT_MENTION_USER_ID: '' })).toMatchObject({
      ALERT_WEBHOOK_URL: undefined,
      ALERT_MENTION_USER_ID: undefined,
    });
    const url = 'https://discord.com/api/webhooks/1/abc';
    expect(loadEnv({ ...valid, ALERT_WEBHOOK_URL: url }).ALERT_WEBHOOK_URL).toBe(url);
    expect(() => loadEnv({ ...valid, ALERT_WEBHOOK_URL: 'http://example.com/hook' })).toThrow(
      /ALERT_WEBHOOK_URL/,
    );
    expect(() => loadEnv({ ...valid, ALERT_MENTION_USER_ID: '@me' })).toThrow(/ALERT_MENTION_USER_ID/);
  });
});
