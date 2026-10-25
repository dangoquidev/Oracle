import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/domain/guild/guild-settings.js';
import { DrizzleCalendarRepository } from '../../src/infrastructure/repositories/drizzle-calendar-repository.js';
import { DrizzleGuildRepository } from '../../src/infrastructure/repositories/drizzle-guild-repository.js';
import { DrizzlePredictionRepository } from '../../src/infrastructure/repositories/drizzle-prediction-repository.js';
import { DrizzlePublicationRepository } from '../../src/infrastructure/repositories/drizzle-publication-repository.js';
import { startTestDatabase, type TestDatabase } from './support/database.js';
import { lecSnapshot, snapshotMatch } from './support/snapshots.js';

describe('prediction and publication repositories', () => {
  let database: TestDatabase;
  let predictions: DrizzlePredictionRepository;
  let publications: DrizzlePublicationRepository;
  let matchIds: number[];
  let weekIds: number[];

  beforeAll(async () => {
    database = await startTestDatabase();
    predictions = new DrizzlePredictionRepository(database.handle.db);
    publications = new DrizzlePublicationRepository(database.handle.db);
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
      lecSnapshot([
        snapshotMatch({ ref: 'bo3' }),
        snapshotMatch({
          ref: 'bo1',
          bestOf: 1,
          weekName: 'Week 2',
          scheduledAt: new Date('2026-07-31T16:00:00Z'),
        }),
      ]),
    );
    const weeks = await calendar.findWeeksBetween(['lec'], new Date('2026-07-01'), new Date('2026-09-01'));
    weekIds = weeks.map((w) => w.id);
    matchIds = (await Promise.all(weekIds.map((id) => calendar.findWeekMatches(id)))).flat().map((m) => m.id);
  });

  describe('DrizzlePredictionRepository', () => {
    it('stores score and winner choices, and replaces them on change', async () => {
      const [bo3, bo1] = matchIds as [number, number];
      await predictions.save({
        guildId: 'g1',
        userId: 'u1',
        matchId: bo3,
        choice: { kind: 'score', score: { team1: 2, team2: 1 } },
        submittedAt: new Date('2026-07-20T10:00:00Z'),
      });
      await predictions.save({
        guildId: 'g1',
        userId: 'u1',
        matchId: bo1,
        choice: { kind: 'winner', winner: 2 },
        submittedAt: new Date('2026-07-20T10:00:00Z'),
      });
      await predictions.save({
        guildId: 'g1',
        userId: 'u1',
        matchId: bo3,
        choice: { kind: 'score', score: { team1: 0, team2: 2 } },
        submittedAt: new Date('2026-07-21T10:00:00Z'),
      });

      const stored = await predictions.findByUser('g1', 'u1', matchIds);
      expect(stored.toSorted((a, b) => a.matchId - b.matchId)).toEqual([
        {
          guildId: 'g1',
          userId: 'u1',
          matchId: bo3,
          choice: { kind: 'score', score: { team1: 0, team2: 2 } },
          submittedAt: new Date('2026-07-21T10:00:00Z'),
          outcome: { status: 'pending' },
        },
        {
          guildId: 'g1',
          userId: 'u1',
          matchId: bo1,
          choice: { kind: 'winner', winner: 2 },
          submittedAt: new Date('2026-07-20T10:00:00Z'),
          outcome: { status: 'pending' },
        },
      ]);
    });

    it('lists every prediction of a server on given matches', async () => {
      const [bo3] = matchIds as [number];
      const choice = { kind: 'winner', winner: 1 } as const;
      for (const [guildId, userId] of [
        ['g1', 'u1'],
        ['g1', 'u2'],
        ['g2', 'u3'],
      ] as const) {
        await predictions.save({ guildId, userId, matchId: bo3, choice, submittedAt: new Date() });
      }
      expect((await predictions.findByMatches('g1', [bo3])).map((p) => p.userId).toSorted()).toEqual([
        'u1',
        'u2',
      ]);
      expect(await predictions.findByMatches('g1', [])).toEqual([]);
    });

    it('scopes predictions by server and user', async () => {
      const [bo3] = matchIds as [number];
      const choice = { kind: 'winner', winner: 1 } as const;
      await predictions.save({ guildId: 'g1', userId: 'u1', matchId: bo3, choice, submittedAt: new Date() });
      expect(await predictions.findByUser('g2', 'u1', matchIds)).toEqual([]);
      expect(await predictions.findByUser('g1', 'u2', matchIds)).toEqual([]);
      expect(await predictions.findByUser('g1', 'u1', [])).toEqual([]);
    });
  });

  describe('DrizzlePublicationRepository', () => {
    it('reserves weeks once per server', async () => {
      const at = new Date('2026-07-21T08:00:00Z');
      const id = await publications.reserve('g1', weekIds, 'c', at);
      expect(id).not.toBeNull();
      expect(await publications.reserve('g1', [weekIds[0] ?? 0], 'c', at)).toBeNull();
      expect(await publications.reserve('g2', weekIds, 'c', at)).not.toBeNull();

      expect(await publications.findPublishedWeekIds('g1', weekIds)).toEqual(new Set(weekIds));
      expect(await publications.findPublishedWeekIds('g1', [])).toEqual(new Set());
      expect(await publications.find(id ?? 0)).toEqual({ id, guildId: 'g1', weekIds });
    });

    it('attaches the message and releases failed reservations', async () => {
      const id = await publications.reserve('g1', weekIds, 'c', new Date());
      if (id === null) throw new Error('reservation failed');
      await publications.attachMessage(id, 'msg', 'fp1');
      expect(await publications.findActive('g1', new Date('2026-07-01T00:00:00Z'))).toEqual([
        { id, guildId: 'g1', channelId: 'c', messageId: 'msg', fingerprint: 'fp1', weekIds },
      ]);
      await publications.setFingerprint(id, 'fp2');
      expect((await publications.findActive('g1', new Date('2026-07-01T00:00:00Z')))[0]?.fingerprint).toBe(
        'fp2',
      );
      await publications.release(id);
      expect(await publications.find(id)).toBeNull();
      expect(await publications.findPublishedWeekIds('g1', weekIds)).toEqual(new Set());
    });

    it('only lists announcements with matches still to come', async () => {
      const id = await publications.reserve('g1', weekIds, 'c', new Date());
      // Week 1 is on 07-24 and week 2 on 07-31: after 07-25 only week 2 keeps the announcement active.
      expect(
        (await publications.findActive('g1', new Date('2026-07-25T00:00:00Z'))).map((p) => p.id),
      ).toEqual([id]);
      expect(await publications.findActive('g1', new Date('2026-08-01T00:00:00Z'))).toEqual([]);
      expect(await publications.findActive('g2', new Date('2026-07-01T00:00:00Z'))).toEqual([]);
    });

    it('propagates unexpected errors', async () => {
      await expect(publications.reserve('g1', [999_999], 'c', new Date())).rejects.toThrow();
    });
  });
});
