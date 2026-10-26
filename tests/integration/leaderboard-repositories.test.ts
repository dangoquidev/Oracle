import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarSnapshot } from '../../src/application/ports/calendar-repository.js';
import { defaultSettings } from '../../src/domain/guild/guild-settings.js';
import type { PredictionOutcome } from '../../src/domain/scoring/score-prediction.js';
import { DrizzleCalendarRepository } from '../../src/infrastructure/repositories/drizzle-calendar-repository.js';
import { DrizzleGuildRepository } from '../../src/infrastructure/repositories/drizzle-guild-repository.js';
import { DrizzleLeaderboardQuery } from '../../src/infrastructure/repositories/drizzle-leaderboard-query.js';
import { DrizzlePredictionRepository } from '../../src/infrastructure/repositories/drizzle-prediction-repository.js';
import { startTestDatabase, type TestDatabase } from './support/database.js';
import { lecSnapshot, snapshotMatch } from './support/snapshots.js';

const SPRING_REF = 'LEC/2026 Season/Spring Season';
const springSnapshot: CalendarSnapshot = {
  competitionId: 'lec',
  seasons: [{ key: '2026 Spring', name: 'LEC 2026 Spring' }],
  // Playoffs not dated yet: the season end stays unknown.
  tournaments: [
    { ref: SPRING_REF, seasonKey: '2026 Spring', name: 'LEC 2026 Spring', startsOn: null, endsOn: null },
  ],
  weeks: [{ tournamentRef: SPRING_REF, name: 'Week 1', order: 1 }],
  teams: [],
  matches: [
    snapshotMatch({
      ref: 'spring',
      tournamentRef: SPRING_REF,
      scheduledAt: new Date('2026-03-06T17:00:00Z'),
      status: 'completed',
      result: { winner: 1, score: { team1: 2, team2: 0 } },
    }),
  ],
};

const scored = (points: number, exactScore = false): PredictionOutcome => ({
  status: 'scored',
  points,
  correctWinner: points > 0,
  exactScore,
});

describe('leaderboard persistence', () => {
  let database: TestDatabase;
  let calendar: DrizzleCalendarRepository;
  let predictions: DrizzlePredictionRepository;
  let leaderboards: DrizzleLeaderboardQuery;
  let ids: Record<'spring' | 'summer1' | 'summer2' | 'week2', number>;

  const predict = async (guildId: string, userId: string, matchId: number, outcome: PredictionOutcome) => {
    await predictions.save({
      guildId,
      userId,
      matchId,
      choice: { kind: 'score', score: { team1: 2, team2: 0 } },
      submittedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await predictions.saveOutcomes([{ guildId, userId, matchId, outcome }], new Date('2026-09-01T00:00:00Z'));
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    calendar = new DrizzleCalendarRepository(database.handle.db);
    predictions = new DrizzlePredictionRepository(database.handle.db);
    leaderboards = new DrizzleLeaderboardQuery(database.handle.db);
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
        snapshotMatch({ ref: 'summer1' }),
        snapshotMatch({ ref: 'summer2', scheduledAt: new Date('2026-07-25T16:00:00Z') }),
        snapshotMatch({ ref: 'week2', weekName: 'Week 2', scheduledAt: new Date('2026-07-31T16:00:00Z') }),
      ]),
    );
    // Teams come with the summer snapshot.
    await calendar.applySnapshot(springSnapshot);
    const matches = await calendar.findMatchesStartedBetween(new Date('2026-01-01'), new Date('2026-12-31'));
    const [spring, summer1, summer2, week2] = matches.map((match) => match.id) as [
      number,
      number,
      number,
      number,
    ];
    ids = { spring, summer1, summer2, week2 };
  });

  it('summarises seasons with their span, end date and weeks', async () => {
    const seasons = await calendar.findSeasons(['lec']);
    const [summer] = await calendar.findWeeksBetween(['lec'], new Date('2026-07-24'), new Date('2026-07-26'));
    expect(seasons.map(({ weekIds, id: _id, ...season }) => ({ ...season, weeks: weekIds.length }))).toEqual([
      {
        competitionId: 'lec',
        name: 'LEC 2026 Spring',
        firstMatchAt: new Date('2026-03-06T17:00:00Z'),
        lastMatchAt: new Date('2026-03-06T17:00:00Z'),
        endsOn: null,
        weeks: 1,
      },
      {
        competitionId: 'lec',
        name: 'LEC 2026 Summer',
        firstMatchAt: new Date('2026-07-24T16:00:00Z'),
        lastMatchAt: new Date('2026-07-31T16:00:00Z'),
        endsOn: '2026-08-30',
        weeks: 2,
      },
    ]);
    expect(seasons[1]?.weekIds).toContain(summer?.id);
    expect(await calendar.findSeasons(['worlds'])).toEqual([]);
    expect(await calendar.findSeasons([])).toEqual([]);
  });

  it('sums judged predictions per player, filtered by season, week, match or competition', async () => {
    await predict('g1', 'alice', ids.spring, scored(3, true));
    await predict('g1', 'alice', ids.summer1, scored(1));
    await predict('g1', 'bob', ids.summer1, scored(0));
    await predict('g1', 'bob', ids.week2, scored(3, true));
    await predict('g1', 'carol', ids.summer2, { status: 'void' });
    await predict('g1', 'dave', ids.summer2, { status: 'pending' });
    await predict('g2', 'alice', ids.summer1, scored(3, true));

    const byUser = (tallies: { userId: string }[]) =>
      tallies.toSorted((a, b) => a.userId.localeCompare(b.userId));
    expect(byUser(await leaderboards.tally('g1', {}))).toEqual([
      { userId: 'alice', points: 4, predictions: 2, correctWinners: 2, exactScores: 1 },
      { userId: 'bob', points: 3, predictions: 2, correctWinners: 1, exactScores: 1 },
    ]);

    const [spring, summer] = await calendar.findSeasons(['lec']);
    expect(await leaderboards.tally('g1', { seasonIds: [spring?.id ?? 0] })).toEqual([
      { userId: 'alice', points: 3, predictions: 1, correctWinners: 1, exactScores: 1 },
    ]);
    expect(
      byUser(await leaderboards.tally('g1', { seasonIds: [summer?.id ?? 0] })).map((t) => t.userId),
    ).toEqual(['alice', 'bob']);
    const week2 = (await calendar.findMatch(ids.week2))?.weekId ?? 0;
    expect(await leaderboards.tally('g1', { weekIds: [week2] })).toMatchObject([
      { userId: 'bob', points: 3 },
    ]);
    expect(await leaderboards.tally('g1', { matchIds: [ids.summer1] })).toHaveLength(2);
    expect(await leaderboards.tally('g1', { competitionIds: ['worlds'] })).toEqual([]);
    expect(await leaderboards.tally('g1', { matchIds: [] })).toEqual([]);
  });

  it('persists how each prediction was judged', async () => {
    await predict('g1', 'alice', ids.spring, scored(3, true));
    expect((await predictions.findByMatches('g1', [ids.spring]))[0]?.outcome).toEqual(scored(3, true));
  });

  it('backfills the breakdown of predictions judged before it existed', async () => {
    await predict('g1', 'alice', ids.spring, scored(3, true));
    await predict('g1', 'bob', ids.summer1, scored(1));
    await predict('g1', 'carol', ids.summer2, scored(0));
    await database.handle.db.execute(sql`update predictions set correct_winner = null, exact_score = null`);

    const migration = readFileSync('drizzle/0003_points_breakdown.sql', 'utf8');
    const backfill = migration.split('--> statement-breakpoint').at(-1) ?? '';
    await database.handle.db.execute(sql.raw(backfill));

    const outcomes = await predictions.findForScoring([ids.spring, ids.summer1, ids.summer2], 'g1');
    expect(Object.fromEntries(outcomes.map((p) => [p.userId, p.outcome]))).toEqual({
      alice: scored(3, true),
      bob: scored(1),
      carol: scored(0),
    });
  });
});
