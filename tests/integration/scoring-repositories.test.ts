import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/domain/guild/guild-settings.js';
import { DrizzleCalendarRepository } from '../../src/infrastructure/repositories/drizzle-calendar-repository.js';
import { DrizzleGuildRepository } from '../../src/infrastructure/repositories/drizzle-guild-repository.js';
import { DrizzlePredictionRepository } from '../../src/infrastructure/repositories/drizzle-prediction-repository.js';
import { DrizzleResultOverrideRepository } from '../../src/infrastructure/repositories/drizzle-result-override-repository.js';
import { startTestDatabase, type TestDatabase } from './support/database.js';
import { lecSnapshot, snapshotMatch } from './support/snapshots.js';

describe('scoring persistence', () => {
  let database: TestDatabase;
  let calendar: DrizzleCalendarRepository;
  let predictions: DrizzlePredictionRepository;
  let overrides: DrizzleResultOverrideRepository;
  let matchIds: number[];

  beforeAll(async () => {
    database = await startTestDatabase();
    calendar = new DrizzleCalendarRepository(database.handle.db);
    predictions = new DrizzlePredictionRepository(database.handle.db);
    overrides = new DrizzleResultOverrideRepository(database.handle.db);
  });
  afterAll(() => database.stop());

  beforeEach(async () => {
    await database.reset();
    const guilds = new DrizzleGuildRepository(database.handle.db);
    for (const id of ['g1', 'g2']) {
      await guilds.saveSettings(id, { ...defaultSettings(['lec']), pingRoleId: 'r', channelId: 'c' });
    }
    await calendar.applySnapshot(
      lecSnapshot([
        snapshotMatch({
          ref: 'played',
          status: 'completed',
          result: { winner: 1, score: { team1: 2, team2: 1 } },
        }),
        snapshotMatch({ ref: 'live', scheduledAt: new Date('2026-07-24T19:00:00Z') }),
        snapshotMatch({ ref: 'later', weekName: 'Week 2', scheduledAt: new Date('2026-07-31T16:00:00Z') }),
      ]),
    );
    const found = await calendar.findMatchesStartedBetween(new Date('2026-07-01'), new Date('2026-09-01'));
    matchIds = found.map((m) => m.id);
  });

  describe('calendar queries', () => {
    it('finds matches by id and by start window, with results in views', async () => {
      const [played, live] = matchIds as [number, number];
      expect((await calendar.findMatches([live, played])).map((m) => m.id).toSorted()).toEqual(
        [played, live].toSorted(),
      );
      expect(await calendar.findMatches([])).toEqual([]);
      const window = await calendar.findMatchesStartedBetween(
        new Date('2026-07-24T16:00:00Z'),
        new Date('2026-07-24T19:00:00Z'),
      );
      expect(window.map((m) => m.id)).toEqual([played, live]);

      const [week1] = await calendar.findWeeksBetween(
        ['lec'],
        new Date('2026-07-01'),
        new Date('2026-07-26'),
      );
      const [view] = await calendar.findWeekViews([week1?.id ?? 0]);
      expect(view?.matches[0]?.result).toEqual({ winner: 1, score: { team1: 2, team2: 1 } });
      expect(view?.matches[1]?.result).toBeNull();
    });

    it('lists competitions with started matches still awaiting a result', async () => {
      expect(
        await calendar.findCompetitionsAwaitingResults(
          new Date('2026-07-24T12:00:00Z'),
          new Date('2026-07-24T20:00:00Z'),
        ),
      ).toEqual(['lec']);
      expect(
        await calendar.findCompetitionsAwaitingResults(
          new Date('2026-07-24T12:00:00Z'),
          new Date('2026-07-24T17:00:00Z'),
        ),
      ).toEqual([]);
    });

    it('knows which teams are cached', async () => {
      expect(await calendar.findKnownTeamNames(['G2 Esports', 'T1'])).toEqual(new Set(['G2 Esports']));
      expect(await calendar.findKnownTeamNames([])).toEqual(new Set());
    });

    it('accepts partial snapshots referencing cached teams', async () => {
      const snapshot = lecSnapshot([snapshotMatch({ ref: 'played', team2: 'Karmine Corp' })]);
      await calendar.applySnapshot({ ...snapshot, teams: [] });
      const [match] = await calendar.findMatches([matchIds[0] ?? 0]);
      expect(match?.team2Id).not.toBeNull();
      const known = await calendar.findKnownTeamNames(['G2 Esports']);
      expect(known.size).toBe(1);
    });
  });

  describe('predictions outcomes', () => {
    it('stores outcomes, and resets them when the pick changes', async () => {
      const [played] = matchIds as [number];
      const choice = { kind: 'score', score: { team1: 2, team2: 1 } } as const;
      await predictions.save({
        guildId: 'g1',
        userId: 'u',
        matchId: played,
        choice,
        submittedAt: new Date('2026-07-20T00:00:00Z'),
      });
      await predictions.save({
        guildId: 'g2',
        userId: 'u',
        matchId: played,
        choice,
        submittedAt: new Date('2026-07-20T00:00:00Z'),
      });

      expect((await predictions.findForScoring([played], null)).map((p) => p.outcome)).toEqual([
        { status: 'pending' },
        { status: 'pending' },
      ]);
      await predictions.saveOutcomes(
        [
          { guildId: 'g1', userId: 'u', matchId: played, outcome: { status: 'scored', points: 3 } },
          { guildId: 'g2', userId: 'u', matchId: played, outcome: { status: 'void' } },
        ],
        new Date('2026-07-25T00:00:00Z'),
      );
      expect((await predictions.findByUser('g1', 'u', [played]))[0]?.outcome).toEqual({
        status: 'scored',
        points: 3,
      });
      expect((await predictions.findForScoring([played], 'g2')).map((p) => p.outcome)).toEqual([
        { status: 'void' },
      ]);
      expect(await predictions.findForScoring([], null)).toEqual([]);

      await predictions.save({
        guildId: 'g1',
        userId: 'u',
        matchId: played,
        choice,
        submittedAt: new Date('2026-07-21T00:00:00Z'),
      });
      expect((await predictions.findByUser('g1', 'u', [played]))[0]?.outcome).toEqual({ status: 'pending' });
    });

    it('never overwrites a pick made after the scoring started', async () => {
      const [, live] = matchIds as [number, number];
      const choice = { kind: 'winner', winner: 1 } as const;
      await predictions.save({
        guildId: 'g1',
        userId: 'u',
        matchId: live,
        choice,
        submittedAt: new Date('2026-07-25T00:00:00Z'),
      });
      await predictions.saveOutcomes(
        [{ guildId: 'g1', userId: 'u', matchId: live, outcome: { status: 'scored', points: 1 } }],
        new Date('2026-07-24T23:00:00Z'),
      );
      expect((await predictions.findByUser('g1', 'u', [live]))[0]?.outcome).toEqual({ status: 'pending' });
    });
  });

  describe('result overrides', () => {
    it('stores corrections and cancellations per server, and clears them', async () => {
      const [played, live] = matchIds as [number, number];
      const at = new Date('2026-07-25T00:00:00Z');
      await overrides.set(
        'g1',
        played,
        { kind: 'result', result: { winner: 2, score: { team1: 0, team2: 2 } } },
        'a',
        at,
      );
      await overrides.set('g1', live, { kind: 'result', result: { winner: 1, score: null } }, 'a', at);
      await overrides.set('g2', played, { kind: 'cancelled' }, 'a', at);

      expect(await overrides.findForMatches('g1', matchIds)).toEqual(
        new Map([
          [played, { kind: 'result', result: { winner: 2, score: { team1: 0, team2: 2 } } }],
          [live, { kind: 'result', result: { winner: 1, score: null } }],
        ]),
      );
      expect(await overrides.findForMatches('g2', matchIds)).toEqual(
        new Map([[played, { kind: 'cancelled' }]]),
      );

      await overrides.set(
        'g2',
        played,
        { kind: 'result', result: { winner: 1, score: { team1: 2, team2: 0 } } },
        'b',
        at,
      );
      expect((await overrides.findForMatches('g2', [played])).get(played)?.kind).toBe('result');

      await overrides.clear('g1', played);
      expect((await overrides.findForMatches('g1', matchIds)).has(played)).toBe(false);
      expect(await overrides.findForMatches('g1', [])).toEqual(new Map());
    });
  });
});
