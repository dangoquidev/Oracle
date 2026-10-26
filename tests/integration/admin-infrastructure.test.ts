import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/domain/guild/guild-settings.js';
import type { PlayerBan } from '../../src/domain/guild/player-ban.js';
import { DrizzleBanRepository } from '../../src/infrastructure/repositories/drizzle-ban-repository.js';
import { DrizzleGuildRepository } from '../../src/infrastructure/repositories/drizzle-guild-repository.js';
import { JobScheduler } from '../../src/infrastructure/scheduler/job-scheduler.js';
import { SilentLogger } from '../../src/test-support/fakes.js';
import { startTestDatabase, type TestDatabase } from './support/database.js';

const ban = (overrides: Partial<PlayerBan> = {}): PlayerBan => ({
  guildId: 'g1',
  userId: 'u1',
  bannedBy: 'admin',
  reason: 'triche',
  bannedAt: new Date('2026-08-01T10:00:00Z'),
  ...overrides,
});

describe('admin infrastructure', () => {
  let database: TestDatabase;
  let bans: DrizzleBanRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    bans = new DrizzleBanRepository(database.handle.db);
  });
  afterAll(() => database.stop());

  beforeEach(async () => {
    await database.reset();
    const guilds = new DrizzleGuildRepository(database.handle.db);
    for (const id of ['g1', 'g2']) {
      await guilds.saveSettings(id, { ...defaultSettings(['lec']), pingRoleId: 'r', channelId: 'c' });
    }
  });

  it('bans a player once per server and lifts the ban', async () => {
    expect(await bans.ban(ban())).toBe(true);
    expect(await bans.ban(ban({ reason: 'autre' }))).toBe(false);
    expect(await bans.ban(ban({ userId: 'u2' }))).toBe(true);
    expect(await bans.ban(ban({ guildId: 'g2' }))).toBe(true);

    expect(await bans.isBanned('g1', 'u1')).toBe(true);
    expect(await bans.isBanned('g1', 'u3')).toBe(false);
    expect(await bans.bannedIds('g1')).toEqual(new Set(['u1', 'u2']));

    expect(await bans.unban('g1', 'u1')).toBe(true);
    expect(await bans.unban('g1', 'u1')).toBe(false);
    expect(await bans.bannedIds('g1')).toEqual(new Set(['u2']));
    expect(await bans.isBanned('g2', 'u1')).toBe(true);
  });

  it('throttles manual job runs', async () => {
    const scheduler = new JobScheduler(database.connectionString, new SilentLogger());
    // Never fires on its own during the test, and the worker leaves queued jobs alone long enough.
    let runs = 0;
    await scheduler.start([
      {
        name: 'manual-test',
        cron: '0 0 1 1 *',
        run: () => {
          runs += 1;
          return Promise.resolve();
        },
      },
    ]);
    try {
      expect(await scheduler.triggerThrottled('manual-test', 600)).toBe(true);
      expect(await scheduler.triggerThrottled('manual-test', 600)).toBe(false);
    } finally {
      await scheduler.stop();
    }
    expect(runs).toBeLessThanOrEqual(1);
  });
});
