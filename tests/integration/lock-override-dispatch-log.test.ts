import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/domain/guild/guild-settings.js';
import { DrizzleCalendarRepository } from '../../src/infrastructure/repositories/drizzle-calendar-repository.js';
import { DrizzleDispatchLog } from '../../src/infrastructure/repositories/drizzle-dispatch-log.js';
import { DrizzleGuildRepository } from '../../src/infrastructure/repositories/drizzle-guild-repository.js';
import { DrizzleLockOverrideRepository } from '../../src/infrastructure/repositories/drizzle-lock-override-repository.js';
import { startTestDatabase, type TestDatabase } from './support/database.js';
import { lecSnapshot, snapshotMatch } from './support/snapshots.js';

describe('lock overrides and dispatch log', () => {
  let database: TestDatabase;
  let overrides: DrizzleLockOverrideRepository;
  let dispatchLog: DrizzleDispatchLog;
  let matchIds: number[];

  beforeAll(async () => {
    database = await startTestDatabase();
    overrides = new DrizzleLockOverrideRepository(database.handle.db);
    dispatchLog = new DrizzleDispatchLog(database.handle.db);
  });
  afterAll(() => database.stop());

  beforeEach(async () => {
    await database.reset();
    const guilds = new DrizzleGuildRepository(database.handle.db);
    for (const id of ['g1', 'g2']) {
      await guilds.saveSettings(id, { ...defaultSettings(['lec']), pingRoleId: 'r', channelId: 'c' });
    }
    const calendar = new DrizzleCalendarRepository(database.handle.db);
    await calendar.applySnapshot(
      lecSnapshot([snapshotMatch({ ref: 'a' }), snapshotMatch({ ref: 'b', matchDay: 2 })]),
    );
    const [week] = await calendar.findWeeksBetween(['lec'], new Date('2026-07-01'), new Date('2026-09-01'));
    matchIds = (await calendar.findWeekMatches(week?.id ?? 0)).map((m) => m.id);
  });

  it('stores and replaces overrides per server', async () => {
    const [a, b] = matchIds as [number, number];
    const first = new Date('2026-07-24T10:00:00Z');
    const second = new Date('2026-07-24T11:00:00Z');
    await overrides.set('g1', [a, b], { state: 'open', at: first }, 'admin');
    await overrides.set('g1', [b], { state: 'closed', at: second }, 'admin2');

    expect(await overrides.findForMatches('g1', matchIds)).toEqual(
      new Map([
        [a, { state: 'open', at: first }],
        [b, { state: 'closed', at: second }],
      ]),
    );
    expect(await overrides.findForMatches('g2', matchIds)).toEqual(new Map());
    expect(await overrides.findForMatches('g1', [])).toEqual(new Map());
    await overrides.set('g1', [], { state: 'open', at: first }, 'admin');
  });

  it('records each notification once per server', async () => {
    const at = new Date('2026-07-24T10:00:00Z');
    await dispatchLog.record('g1', 'reminder:1:123', at);
    await dispatchLog.record('g1', 'reminder:1:123', at);

    expect(await dispatchLog.findSent('g1', ['reminder:1:123', 'reveal:1:123'])).toEqual(
      new Set(['reminder:1:123']),
    );
    expect(await dispatchLog.findSent('g2', ['reminder:1:123'])).toEqual(new Set());
    expect(await dispatchLog.findSent('g1', [])).toEqual(new Set());
  });
});
