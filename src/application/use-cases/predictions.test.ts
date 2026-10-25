import { beforeEach, describe, expect, it } from 'vitest';
import type { PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryLockOverrideRepository,
  InMemoryPredictionRepository,
  InMemoryPublicationRepository,
} from '../../test-support/fakes.js';
import { GetPredictionJourney } from './get-prediction-journey.js';
import { LockCalculatorFactory } from './lock-calculator.js';
import { SubmitPrediction } from './submit-prediction.js';

const g2Wins: PredictionChoice = { kind: 'winner', winner: 1 };
const twoOne: PredictionChoice = { kind: 'score', score: { team1: 2, team2: 1 } };

// Day 1: 16:00 and 19:00 UTC → per-day lock (2h) at 14:00 UTC for both.
const early = match({ id: 1, scheduledAt: new Date('2026-08-01T16:00:00Z'), bestOf: 1 });
const late = match({ id: 2, scheduledAt: new Date('2026-08-01T19:00:00Z'), bestOf: 3 });
const tbd = match({ id: 3, matchDay: 2, scheduledAt: new Date('2026-08-02T16:00:00Z'), team2Id: null });
const played = match({
  id: 4,
  matchDay: 2,
  scheduledAt: new Date('2026-08-02T19:00:00Z'),
  status: 'completed',
  result: { winner: 1, score: null },
});

describe('predictions', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let predictions: InMemoryPredictionRepository;
  let publications: InMemoryPublicationRepository;
  let clock: FixedClock;
  let overrides: InMemoryLockOverrideRepository;
  let locks: LockCalculatorFactory;

  beforeEach(async () => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
    calendar = new InMemoryCalendarRepository();
    const week1 = week({ id: 1 });
    calendar.weeks.push(week1);
    calendar.matches.push(early, late, tbd, played);
    calendar.views.push(weekView(week1, [early, late, tbd, played]));
    predictions = new InMemoryPredictionRepository();
    publications = new InMemoryPublicationRepository();
    await publications.reserve('g1', [1], 'channel-1', new Date());
    clock = new FixedClock(new Date('2026-08-01T10:00:00Z'));
    overrides = new InMemoryLockOverrideRepository();
    locks = new LockCalculatorFactory(calendar, overrides);
  });

  describe('SubmitPrediction', () => {
    const submit = (
      matchId: number,
      choice: PredictionChoice,
      submittedAt = new Date('2026-08-01T13:59:59Z'),
    ) =>
      new SubmitPrediction(guilds, calendar, predictions, locks).execute({
        guildId: 'g1',
        userId: 'u1',
        matchId,
        choice,
        submittedAt,
      });

    it('records a valid prediction before the lock', async () => {
      expect((await submit(1, g2Wins)).ok).toBe(true);
      expect(predictions.predictions).toEqual([
        {
          guildId: 'g1',
          userId: 'u1',
          matchId: 1,
          choice: g2Wins,
          submittedAt: new Date('2026-08-01T13:59:59Z'),
        },
      ]);
    });

    it('lets the user change their mind until the lock', async () => {
      await submit(2, twoOne);
      await submit(2, { kind: 'score', score: { team1: 0, team2: 2 } });
      expect(predictions.predictions).toHaveLength(1);
      expect(predictions.predictions[0]?.choice).toEqual({ kind: 'score', score: { team1: 0, team2: 2 } });
    });

    it('locks the whole match day before its first match, based on the interaction time', async () => {
      expect(await submit(2, twoOne, new Date('2026-08-01T14:00:00Z'))).toEqual({
        ok: false,
        error: 'locked',
      });
      expect(predictions.predictions).toEqual([]);
    });

    it('rejects choices that do not fit the format', async () => {
      expect(await submit(1, twoOne)).toEqual({ ok: false, error: 'invalid-choice' });
      expect(await submit(2, g2Wins)).toEqual({ ok: false, error: 'invalid-choice' });
    });

    it('rejects matches that cannot be predicted', async () => {
      expect(await submit(99, g2Wins)).toEqual({ ok: false, error: 'match-not-found' });
      expect(await submit(3, g2Wins)).toEqual({ ok: false, error: 'opponents-unknown' });
      expect(await submit(4, g2Wins)).toEqual({ ok: false, error: 'match-not-open' });
    });

    it('accepts votes after the computed lock when an admin reopened the match, until kick-off', async () => {
      await overrides.set('g1', [2], { state: 'open', at: new Date('2026-08-01T14:30:00Z') }, 'admin');
      expect((await submit(2, twoOne, new Date('2026-08-01T18:59:00Z'))).ok).toBe(true);
      expect(await submit(2, twoOne, new Date('2026-08-01T19:00:00Z'))).toEqual({
        ok: false,
        error: 'locked',
      });
    });

    it('refuses votes once an admin closed the match early', async () => {
      await overrides.set('g1', [1], { state: 'closed', at: new Date('2026-08-01T09:00:00Z') }, 'admin');
      expect(await submit(1, g2Wins, new Date('2026-08-01T09:30:00Z'))).toEqual({
        ok: false,
        error: 'locked',
      });
    });

    it('rejects predictions on inactive servers', async () => {
      guilds.add({ ...activeGuild('g1'), status: 'paused' });
      expect(await submit(1, g2Wins)).toEqual({ ok: false, error: 'guild-not-active' });
    });
  });

  describe('GetPredictionJourney', () => {
    const journey = (guildId = 'g1', publicationId = 1) =>
      new GetPredictionJourney(guilds, publications, calendar, predictions, locks, clock).execute(
        guildId,
        'u1',
        publicationId,
      );

    it('lists every match with its state, options and current choice', async () => {
      await predictions.save({
        guildId: 'g1',
        userId: 'u1',
        matchId: 2,
        choice: twoOne,
        submittedAt: new Date(),
      });
      await predictions.save({
        guildId: 'g1',
        userId: 'other',
        matchId: 1,
        choice: g2Wins,
        submittedAt: new Date(),
      });

      const result = await journey();

      if (!result.ok) throw new Error(result.error);
      expect(result.value).toMatchObject({ publicationId: 1, locale: 'fr', timeZone: 'Europe/Paris' });
      expect(
        result.value.items.map((item) => [item.match.id, item.state, item.choices.length, item.current]),
      ).toEqual([
        [1, 'open', 2, null],
        [2, 'open', 4, twoOne],
        [3, 'awaiting-opponents', 2, null],
        [4, 'closed', 2, null],
      ]);
      expect(result.value.items[1]?.lockAt).toEqual(new Date('2026-08-01T14:00:00Z'));
      expect(result.value.items[0]?.weekName).toBe('Week 1');
    });

    it('marks matches past their lock and reveals how the server voted', async () => {
      await predictions.save({
        guildId: 'g1',
        userId: 'u1',
        matchId: 1,
        choice: g2Wins,
        submittedAt: new Date(),
      });
      await predictions.save({
        guildId: 'g1',
        userId: 'u2',
        matchId: 1,
        choice: g2Wins,
        submittedAt: new Date(),
      });
      await predictions.save({
        guildId: 'g2',
        userId: 'u3',
        matchId: 1,
        choice: g2Wins,
        submittedAt: new Date(),
      });
      clock.set(new Date('2026-08-01T15:00:00Z'));

      const result = await journey();

      if (!result.ok) throw new Error(result.error);
      expect(result.value.items[0]?.state).toBe('locked');
      expect(result.value.items[0]?.distribution).toMatchObject({ total: 2, team1Percent: 100 });
      expect(result.value.items[2]?.distribution).toBeNull();
    });

    it('keeps votes hidden while a match is open', async () => {
      await predictions.save({
        guildId: 'g1',
        userId: 'u2',
        matchId: 1,
        choice: g2Wins,
        submittedAt: new Date(),
      });
      const result = await journey();
      expect(result.ok && result.value.items[0]?.distribution).toBeNull();
    });

    it('refuses publications of another server or unknown ones', async () => {
      guilds.add(activeGuild('g2'));
      expect(await journey('g2', 1)).toEqual({ ok: false, error: 'publication-not-found' });
      expect(await journey('g1', 42)).toEqual({ ok: false, error: 'publication-not-found' });
    });

    it('refuses inactive servers', async () => {
      expect(await journey('nope')).toEqual({ ok: false, error: 'guild-not-active' });
    });
  });
});
