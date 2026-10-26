import { beforeEach, describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../config/competitions.js';
import type { PredictionOutcome } from '../../domain/scoring/score-prediction.js';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryLeaderboardQuery,
  InMemoryLockOverrideRepository,
  InMemoryPredictionRepository,
  InMemoryResultOverrideRepository,
} from '../../test-support/fakes.js';
import type { SeasonSummary } from '../ports/calendar-repository.js';
import { GetLeaderboard, type LeaderboardRequest } from './get-leaderboard.js';
import { GetMyPredictions } from './get-my-predictions.js';
import { ListSeasons } from './list-seasons.js';
import { ListWeekMatches } from './list-week-matches.js';
import { LockCalculatorFactory } from './lock-calculator.js';

const scored = (points: number, exactScore = false): PredictionOutcome => ({
  status: 'scored',
  points,
  correctWinner: points > 0,
  exactScore,
});

// Spring split (weeks 1-2) is over; the summer split (week 3) is being played.
const spring1 = week({
  id: 1,
  startsAt: new Date('2026-03-06T17:00:00Z'),
  endsAt: new Date('2026-03-08T17:00:00Z'),
});
const spring2 = week({
  id: 2,
  startsAt: new Date('2026-03-13T17:00:00Z'),
  endsAt: new Date('2026-03-15T17:00:00Z'),
});
const summer1 = week({
  id: 3,
  startsAt: new Date('2026-08-01T16:00:00Z'),
  endsAt: new Date('2026-08-02T16:00:00Z'),
});
const worlds1 = week({
  id: 4,
  competitionId: 'worlds',
  name: 'Swiss Round 1',
  startsAt: new Date('2026-07-30T16:00:00Z'),
  endsAt: new Date('2026-07-31T16:00:00Z'),
});
const springMatch1 = match({ id: 1, weekId: 1, scheduledAt: spring1.startsAt, status: 'completed' });
const springMatch2 = match({ id: 2, weekId: 2, scheduledAt: spring2.startsAt, status: 'completed' });
const summerPlayed = match({
  id: 3,
  weekId: 3,
  scheduledAt: summer1.startsAt,
  status: 'completed',
  result: { winner: 1, score: null },
});
const summerUpcoming = match({ id: 4, weekId: 3, matchDay: 2, scheduledAt: summer1.endsAt, bestOf: 3 });
const worldsMatch = match({ id: 5, weekId: 4, competitionId: 'worlds', scheduledAt: worlds1.startsAt });

const season = (overrides: Partial<SeasonSummary> & Pick<SeasonSummary, 'id' | 'name'>): SeasonSummary => ({
  competitionId: 'lec',
  firstMatchAt: spring1.startsAt,
  lastMatchAt: spring2.startsAt,
  endsOn: '2026-03-15',
  weekIds: [1, 2],
  ...overrides,
});

describe('leaderboards', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let predictions: InMemoryPredictionRepository;
  let clock: FixedClock;

  const predict = async (userId: string, matchId: number, outcome: PredictionOutcome, guildId = 'g1') => {
    await predictions.save({
      guildId,
      userId,
      matchId,
      choice: { kind: 'winner', winner: 1 },
      submittedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await predictions.saveOutcomes([{ guildId, userId, matchId, outcome }], new Date());
  };

  beforeEach(async () => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1', { competitionIds: ['lec'] }));
    calendar = new InMemoryCalendarRepository();
    calendar.weeks.push(spring1, spring2, summer1, worlds1);
    calendar.matches.push(springMatch1, springMatch2, summerPlayed, summerUpcoming, worldsMatch);
    calendar.views.push(weekView(summer1, [summerPlayed, summerUpcoming]));
    calendar.seasons.push(
      season({ id: 1, name: 'LEC 2026 Spring' }),
      season({
        id: 2,
        name: 'LEC 2026 Summer',
        firstMatchAt: summer1.startsAt,
        lastMatchAt: summer1.endsAt,
        endsOn: null,
        weekIds: [3],
      }),
      season({
        id: 3,
        competitionId: 'worlds',
        name: 'Worlds 2026',
        firstMatchAt: worlds1.startsAt,
        lastMatchAt: worlds1.endsAt,
        weekIds: [4],
      }),
    );
    predictions = new InMemoryPredictionRepository();
    clock = new FixedClock(new Date('2026-08-02T12:00:00Z'));

    await predict('alice', 1, scored(3, true));
    await predict('bob', 1, scored(1));
    await predict('alice', 2, scored(0));
    await predict('bob', 2, scored(1));
    await predict('carol', 2, scored(1));
    await predict('alice', 3, scored(1));
    await predict('bob', 3, scored(0));
    await predict('dave', 3, { status: 'void' });
    await predict('alice', 5, scored(1));
    await predict('zoe', 3, scored(9), 'g2');
  });

  describe('GetLeaderboard', () => {
    const board = (request: Partial<LeaderboardRequest> = {}) =>
      new GetLeaderboard(
        guilds,
        calendar,
        new InMemoryLeaderboardQuery(predictions, calendar),
        COMPETITIONS,
        clock,
      ).execute({
        guildId: 'g1',
        userId: 'bob',
        period: 'season',
        competitionId: null,
        seasonId: null,
        ...request,
      });

    it('ranks the current split of the enabled competitions', async () => {
      const result = await board();
      if (!result.ok) throw new Error(result.error);
      expect(result.value.scopes).toEqual([{ competitionName: 'LEC', label: 'LEC 2026 Summer' }]);
      expect(result.value.entries.map((entry) => [entry.userId, entry.rank, entry.points])).toEqual([
        ['alice', 1, 1],
        ['bob', 2, 0],
      ]);
      expect(result.value.viewer).toMatchObject({
        userId: 'bob',
        rank: 2,
        predictions: 1,
        correctWinners: 0,
      });
    });

    it('shows a past split, players tied on points sharing their rank', async () => {
      await predict('carol', 1, scored(1));
      const result = await board({ seasonId: 1, period: 'week' });
      if (!result.ok) throw new Error(result.error);
      expect(result.value.period).toBe('season');
      expect(result.value.scopes).toEqual([{ competitionName: 'LEC', label: 'LEC 2026 Spring' }]);
      expect(result.value.entries.map((entry) => [entry.userId, entry.rank, entry.points])).toEqual([
        ['alice', 1, 3],
        ['bob', 2, 2],
        ['carol', 2, 2],
      ]);
    });

    it('ranks the week being played', async () => {
      const result = await board({ period: 'week' });
      if (!result.ok) throw new Error(result.error);
      expect(result.value.scopes).toEqual([{ competitionName: 'LEC', label: 'Week 1' }]);
      expect(result.value.entries.map((entry) => entry.userId)).toEqual(['alice', 'bob']);
    });

    it('sums every competition all time, or one competition when asked', async () => {
      const all = await board({ period: 'alltime' });
      if (!all.ok) throw new Error(all.error);
      expect(all.value.scopes).toEqual([]);
      expect(all.value.entries.map((entry) => [entry.userId, entry.points, entry.exactScores])).toEqual([
        ['alice', 5, 1],
        ['bob', 2, 0],
        ['carol', 1, 0],
      ]);

      const worlds = await board({ period: 'alltime', competitionId: 'worlds' });
      expect(worlds.ok && worlds.value.entries.map((entry) => entry.userId)).toEqual(['alice']);
      expect(worlds.ok && worlds.value.scopes).toEqual([{ competitionName: 'Worlds', label: null }]);
    });

    it('has nothing to rank before a period starts', async () => {
      clock.set(new Date('2026-01-01T00:00:00Z'));
      const result = await board({ period: 'week' });
      expect(result.ok && result.value).toMatchObject({ scopes: [], entries: [], viewer: null });
    });

    it('rejects unknown seasons and inactive servers', async () => {
      expect(await board({ seasonId: 99 })).toEqual({ ok: false, error: 'season-not-found' });
      expect(await board({ guildId: 'nope' })).toEqual({ ok: false, error: 'guild-not-active' });
    });
  });

  describe('ListSeasons', () => {
    it('lists started seasons, newest first', async () => {
      const seasons = new ListSeasons(calendar, COMPETITIONS, clock);
      expect(await seasons.execute('lec')).toEqual([
        { id: 2, name: 'LEC 2026 Summer', competitionName: 'LEC' },
        { id: 1, name: 'LEC 2026 Spring', competitionName: 'LEC' },
      ]);
      expect((await seasons.execute(null)).map((s) => s.id)).toEqual([2, 3, 1]);
      clock.set(new Date('2026-07-31T00:00:00Z'));
      expect((await seasons.execute(null)).map((s) => s.id)).toEqual([3, 1]);
    });
  });

  describe('GetMyPredictions', () => {
    const mine = (userId: string) => {
      const weekMatches = new ListWeekMatches(
        guilds,
        calendar,
        predictions,
        new InMemoryResultOverrideRepository(),
        new LockCalculatorFactory(calendar, new InMemoryLockOverrideRepository()),
        COMPETITIONS,
        clock,
      );
      return new GetMyPredictions(weekMatches, predictions).execute('g1', userId, 0, null);
    };

    it('pairs each match of the week with the player pick and totals the points', async () => {
      await predictions.save({
        guildId: 'g1',
        userId: 'alice',
        matchId: 4,
        choice: { kind: 'score', score: { team1: 2, team2: 1 } },
        submittedAt: new Date('2026-08-01T00:00:00Z'),
      });
      const result = await mine('alice');
      if (!result.ok) throw new Error(result.error);
      const [summer] = result.value.weeks;
      expect(summer?.items.map((item) => [item.match.id, item.prediction?.outcome.status ?? null])).toEqual([
        [3, 'scored'],
        [4, 'pending'],
      ]);
      expect(summer?.totals).toEqual({ picked: 2, judged: 1, points: 1, correctWinners: 1, exactScores: 0 });
    });

    it('ignores cancelled picks in the totals', async () => {
      const result = await mine('dave');
      expect(result.ok && result.value.weeks[0]?.totals).toEqual({
        picked: 1,
        judged: 0,
        points: 0,
        correctWinners: 0,
        exactScores: 0,
      });
    });

    it('forwards week listing errors', async () => {
      const weekMatches = new ListWeekMatches(
        guilds,
        calendar,
        predictions,
        new InMemoryResultOverrideRepository(),
        new LockCalculatorFactory(calendar, new InMemoryLockOverrideRepository()),
        COMPETITIONS,
        clock,
      );
      const result = await new GetMyPredictions(weekMatches, predictions).execute('g1', 'alice', 0, 'worlds');
      expect(result).toEqual({ ok: false, error: 'competition-not-enabled' });
    });
  });
});
