import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, type GuildSettings } from '../../src/domain/guild/guild-settings.js';
import { DrizzleGuildRepository } from '../../src/infrastructure/repositories/drizzle-guild-repository.js';
import { startTestDatabase, type TestDatabase } from './support/database.js';

const settings: GuildSettings = {
  ...defaultSettings(['lec', 'worlds']),
  pingRoleId: 'role',
  channelId: 'channel',
  locale: 'en',
  publish: { weekday: 3, hour: 18, minute: 30 },
  lock: { mode: 'per-match', offsetMinutes: 30 },
  reminders: { enabled: false, offsetMinutes: 45 },
};

describe('DrizzleGuildRepository', () => {
  let database: TestDatabase;
  let guilds: DrizzleGuildRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    guilds = new DrizzleGuildRepository(database.handle.db);
  });
  afterAll(() => database.stop());
  beforeEach(() => database.reset());

  it('registers a server once', async () => {
    expect(await guilds.register('g1')).toBe(true);
    expect(await guilds.register('g1')).toBe(false);
    expect(await guilds.find('g1')).toEqual({
      id: 'g1',
      status: 'unconfigured',
      pauseReason: null,
      settings: null,
    });
    expect(await guilds.find('unknown')).toBeNull();
  });

  it('round-trips settings and activates the server', async () => {
    await guilds.register('g1');
    await guilds.saveSettings('g1', settings);
    expect(await guilds.find('g1')).toEqual({ id: 'g1', status: 'active', pauseReason: null, settings });
  });

  it('saves settings for a server it never saw join', async () => {
    await guilds.saveSettings('g1', settings);
    expect((await guilds.find('g1'))?.status).toBe('active');
  });

  it('replaces enabled competitions on reconfiguration', async () => {
    await guilds.saveSettings('g1', settings);
    await guilds.saveSettings('g1', { ...settings, competitionIds: ['worlds'] });
    expect((await guilds.find('g1'))?.settings?.competitionIds).toEqual(['worlds']);
  });

  it('pauses, then reactivates on reconfiguration', async () => {
    await guilds.saveSettings('g1', settings);
    await guilds.pause('g1', 'channel-deleted');
    expect(await guilds.find('g1')).toMatchObject({ status: 'paused', pauseReason: 'channel-deleted' });
    expect(await guilds.listActive()).toEqual([]);

    await guilds.saveSettings('g1', settings);
    expect(await guilds.find('g1')).toMatchObject({ status: 'active', pauseReason: null });
  });

  it('requires a new setup after leaving and coming back, keeping old settings as a starting point', async () => {
    await guilds.saveSettings('g1', settings);
    await guilds.markLeft('g1');
    expect(await guilds.listPresentIds()).toEqual([]);

    expect(await guilds.register('g1')).toBe(true);
    expect(await guilds.find('g1')).toMatchObject({ status: 'unconfigured', settings });
  });

  it('lists active servers with their settings and present servers', async () => {
    await guilds.saveSettings('g1', settings);
    await guilds.saveSettings('g2', { ...settings, competitionIds: ['lec'] });
    await guilds.register('g3');

    const active = await guilds.listActive();
    expect(active.map((g) => [g.id, g.settings?.competitionIds])).toEqual([
      ['g1', ['lec', 'worlds']],
      ['g2', ['lec']],
    ]);
    expect((await guilds.listPresentIds()).toSorted()).toEqual(['g1', 'g2', 'g3']);
  });
});
