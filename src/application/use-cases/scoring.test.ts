import { beforeEach, describe, expect, it } from 'vitest';
import type { Competition } from '../../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../../domain/competition/scoring.js';
import type { PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryPredictionRepository,
  InMemoryResultOverrideRepository,
  SilentLogger,
  StubMatchDataProvider,
} from '../../test-support/fakes.js';
import { DecideMatchResult, RecalculatePoints } from './admin-results.js';
import { PollLiveResults } from './poll-live-results.js';
import { ScorePredictions } from './score-predictions.js';
import { SyncSchedule } from './sync-schedule.js';

const competitions: Competition[] = [
  { id: 'lec', name: 'LEC', source: { league: 'LEC' }, scoring: DEFAULT_SCORING },
  {
    id: 'worlds',
    name: 'Worlds',
    source: { league: 'Worlds' },
    scoring: { correctWinner: 2, exactScoreBonus: 3 },
  },
];

const twoOne: PredictionChoice = { kind: 'score', score: { team1: 2, team2: 1 } };
const twoZero: PredictionChoice = { kind: 'score', score: { team1: 2, team2: 0 } };
const team2Wins: PredictionChoice = { kind: 'score', score: { team1: 0, team2: 2 } };

const finished = match({
  id: 1,
  bestOf: 3,
  scheduledAt: new Date('2026-08-01T16:00:00Z'),
  status: 'completed',
  result: { winner: 1, score: { team1: 2, team2: 1 } },
});
const upcoming = match({ id: 2, bestOf: 3, scheduledAt: new Date('2026-08-03T16:00:00Z') });
const worldsFinished = match({
  id: 3,
  competitionId: 'worlds',
  bestOf: 1,
  scheduledAt: new Date('2026-08-01T18:00:00Z'),
  status: 'completed',
  result: { winner: 2, score: null },
});

describe('scoring', () => {
  let calendar: InMemoryCalendarRepository;
  let predictions: InMemoryPredictionRepository;
  let overrides: InMemoryResultOverrideRepository;
  let clock: FixedClock;
  let score: ScorePredictions;

  const vote = (guildId: string, userId: string, matchId: number, choice: PredictionChoice) =>
    predictions.save({ guildId, userId, matchId, choice, submittedAt: new Date('2026-07-31T00:00:00Z') });
  const outcomeOf = (guildId: string, userId: string, matchId: number) =>
    predictions.predictions.find((p) => p.guildId === guildId && p.userId === userId && p.matchId === matchId)
      ?.outcome;

  beforeEach(() => {
    calendar = new InMemoryCalendarRepository();
    calendar.matches.push(finished, upcoming, worldsFinished);
    predictions = new InMemoryPredictionRepository();
    overrides = new InMemoryResultOverrideRepository();
    clock = new FixedClock(new Date('2026-08-02T00:00:00Z'));
    score = new ScorePredictions(calendar, predictions, overrides, competitions, clock, new SilentLogger());
  });

  describe('ScorePredictions', () => {
    it('scores finished matches with each competition scoring, leaving upcoming ones pending', async () => {
      await vote('g1', 'exact', 1, twoOne);
      await vote('g1', 'winner', 1, twoZero);
      await vote('g1', 'wrong', 1, team2Wins);
      await vote('g1', 'worlds', 3, { kind: 'winner', winner: 2 });
      await vote('g1', 'early', 2, twoOne);

      expect(await score.execute()).toBe(4);

      expect(outcomeOf('g1', 'exact', 1)).toMatchObject({ status: 'scored', points: 3 });
      expect(outcomeOf('g1', 'winner', 1)).toMatchObject({ status: 'scored', points: 1 });
      expect(outcomeOf('g1', 'wrong', 1)).toMatchObject({ status: 'scored', points: 0 });
      expect(outcomeOf('g1', 'worlds', 3)).toMatchObject({ status: 'scored', points: 2 });
      expect(outcomeOf('g1', 'early', 2)).toEqual({ status: 'pending' });
    });

    it('is idempotent', async () => {
      await vote('g1', 'u', 1, twoOne);
      await score.execute();
      expect(await score.execute()).toBe(0);
      expect(predictions.outcomeWrites).toHaveLength(1);
    });

    it('applies corrections and cancellations to their server only', async () => {
      await vote('g1', 'u', 1, twoOne);
      await vote('g2', 'u', 1, twoOne);
      await overrides.set('g1', 1, { kind: 'result', result: { winner: 2, score: { team1: 1, team2: 2 } } });
      await overrides.set('g2', 1, { kind: 'cancelled' });

      await score.execute();

      expect(outcomeOf('g1', 'u', 1)).toMatchObject({ status: 'scored', points: 0 });
      expect(outcomeOf('g2', 'u', 1)).toEqual({ status: 'void' });
    });

    it('can target one server and given matches', async () => {
      await vote('g1', 'u', 1, twoOne);
      await vote('g2', 'u', 1, twoOne);
      expect(await score.execute({ guildId: 'g1', matchIds: [1] })).toBe(1);
      expect(outcomeOf('g2', 'u', 1)).toEqual({ status: 'pending' });
      expect(await score.execute({ matchIds: [99] })).toBe(0);
    });

    it('falls back to the default scoring for unknown competitions', async () => {
      calendar.matches.push({ ...finished, id: 4, competitionId: 'lck' });
      await vote('g1', 'u', 4, twoOne);
      await score.execute();
      expect(outcomeOf('g1', 'u', 4)).toMatchObject({ status: 'scored', points: 3 });
    });
  });

  describe('DecideMatchResult and RecalculatePoints', () => {
    let guilds: InMemoryGuildRepository;
    let decide: DecideMatchResult;

    beforeEach(() => {
      guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
      const week1 = week({ id: 1 });
      calendar.views.push(weekView(week1, [finished, upcoming]));
      decide = new DecideMatchResult(guilds, calendar, overrides, score, clock);
    });

    it('corrects a result and rescores the server', async () => {
      await vote('g1', 'u', 1, twoZero);
      const outcome = await decide.execute('g1', 'admin', 1, {
        kind: 'result',
        result: { winner: 1, score: { team1: 2, team2: 0 } },
      });
      expect(outcome.ok && [outcome.value.rescored, outcome.value.weekName, outcome.value.match.id]).toEqual([
        1,
        'Week 1',
        1,
      ]);
      expect(outcomeOf('g1', 'u', 1)).toMatchObject({ status: 'scored', points: 3 });
    });

    it('cancels a match, then restores the provider result', async () => {
      await vote('g1', 'u', 1, twoOne);
      await decide.execute('g1', 'admin', 1, { kind: 'cancel' });
      expect(outcomeOf('g1', 'u', 1)).toEqual({ status: 'void' });

      await decide.execute('g1', 'admin', 1, { kind: 'provider' });
      expect(outcomeOf('g1', 'u', 1)).toMatchObject({ status: 'scored', points: 3 });
      expect(overrides.overrides.size).toBe(0);
    });

    it('cancels a match that has not started yet', async () => {
      const outcome = await decide.execute('g1', 'admin', 2, { kind: 'cancel' });
      expect(outcome.ok).toBe(true);
    });

    it('validates the result', async () => {
      const result = (winner: 1 | 2, team1: number, team2: number) => ({
        kind: 'result' as const,
        result: { winner, score: { team1, team2 } },
      });
      expect(await decide.execute('g1', 'a', 1, result(2, 2, 1))).toEqual({
        ok: false,
        error: 'invalid-result',
      });
      expect(await decide.execute('g1', 'a', 1, result(1, 3, 0))).toEqual({
        ok: false,
        error: 'invalid-result',
      });
      expect(
        await decide.execute('g1', 'a', 1, { kind: 'result', result: { winner: 1, score: null } }),
      ).toEqual({
        ok: false,
        error: 'invalid-result',
      });
      expect(await decide.execute('g1', 'a', 2, result(1, 2, 0))).toEqual({
        ok: false,
        error: 'match-not-started',
      });
    });

    it('accepts a Bo1 result without score', async () => {
      calendar.views.push(weekView(week({ id: 9 }), [{ ...worldsFinished, weekId: 9 }]));
      calendar.matches.splice(2, 1, { ...worldsFinished, weekId: 9 });
      const outcome = await decide.execute('g1', 'a', 3, {
        kind: 'result',
        result: { winner: 1, score: null },
      });
      expect(outcome.ok).toBe(true);
    });

    it('refuses unknown matches and inactive servers', async () => {
      expect(await decide.execute('g1', 'a', 42, { kind: 'cancel' })).toEqual({
        ok: false,
        error: 'match-not-found',
      });
      calendar.matches.push(match({ id: 50, weekId: 77 }));
      expect(await decide.execute('g1', 'a', 50, { kind: 'cancel' })).toEqual({
        ok: false,
        error: 'match-not-found',
      });
      expect(await decide.execute('nope', 'a', 1, { kind: 'cancel' })).toEqual({
        ok: false,
        error: 'guild-not-active',
      });
    });

    it('recalculates every prediction of a server', async () => {
      await vote('g1', 'u', 1, twoOne);
      const recalc = new RecalculatePoints(guilds, score);
      expect(await recalc.execute('g1')).toEqual({ ok: true, value: 1 });
      expect(await recalc.execute('g1')).toEqual({ ok: true, value: 0 });
      expect(await recalc.execute('nope')).toEqual({ ok: false, error: 'guild-not-active' });
    });
  });

  describe('PollLiveResults', () => {
    let provider: StubMatchDataProvider;
    let poll: PollLiveResults;

    beforeEach(() => {
      provider = new StubMatchDataProvider();
      const sync = new SyncSchedule(provider, calendar, competitions, clock, new SilentLogger());
      poll = new PollLiveResults(calendar, sync, score, clock, new SilentLogger());
    });

    it('stays idle outside match windows, without calling the provider', async () => {
      expect(await poll.execute()).toBe(false);
      expect(calendar.snapshots).toEqual([]);
    });

    it('re-syncs competitions awaiting results, then scores', async () => {
      calendar.matches.push(
        match({ id: 10, competitionId: 'worlds', scheduledAt: new Date('2026-08-01T20:00:00Z') }),
      );
      provider.tournaments.set('Worlds', [
        { ref: 'W', name: 'W', year: '2026', split: null, startsOn: null, endsOn: null },
      ]);
      await vote('g1', 'u', 1, twoOne);

      expect(await poll.execute()).toBe(true);
      expect(outcomeOf('g1', 'u', 1)).toMatchObject({ status: 'scored', points: 3 });
    });

    it('scores even when the provider fails', async () => {
      calendar.matches.push(
        match({ id: 10, competitionId: 'worlds', scheduledAt: new Date('2026-08-01T20:00:00Z') }),
      );
      provider.failingLeagues.add('Worlds');
      await vote('g1', 'u', 1, twoOne);
      await expect(poll.execute()).rejects.toThrow();
      expect(outcomeOf('g1', 'u', 1)).toMatchObject({ status: 'scored', points: 3 });
    });
  });
});
