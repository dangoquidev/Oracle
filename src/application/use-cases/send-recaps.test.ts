import { beforeEach, describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../config/competitions.js';
import type { RecapFrequency } from '../../domain/guild/guild-settings.js';
import type { Match } from '../../domain/match/match.js';
import type { PredictionOutcome } from '../../domain/scoring/score-prediction.js';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryDispatchLog,
  InMemoryGuildRepository,
  InMemoryLeaderboardQuery,
  InMemoryPredictionRepository,
  InMemoryPublicationRepository,
  InMemoryResultOverrideRepository,
  RecordingMessenger,
  SilentLogger,
} from '../../test-support/fakes.js';
import type { SeasonSummary } from '../ports/calendar-repository.js';
import { SendRecaps } from './send-recaps.js';

const scored = (points: number): PredictionOutcome => ({
  status: 'scored',
  points,
  correctWinner: points > 0,
  exactScore: false,
});
const won = { status: 'completed', result: { winner: 1, score: null } } as const;

// Friday 18:00 and 21:00 Paris, then Saturday 18:00 Paris.
const round = week({
  id: 4,
  competitionId: 'worlds',
  name: 'Round 1',
  startsAt: new Date('2026-08-07T16:00:00Z'),
  endsAt: new Date('2026-08-08T16:00:00Z'),
});
const friday1 = match({
  id: 1,
  weekId: 4,
  competitionId: 'worlds',
  matchDay: null,
  scheduledAt: round.startsAt,
});
const friday2 = match({
  id: 2,
  weekId: 4,
  competitionId: 'worlds',
  matchDay: null,
  scheduledAt: new Date('2026-08-07T19:00:00Z'),
});
const saturday = match({
  id: 3,
  weekId: 4,
  competitionId: 'worlds',
  matchDay: null,
  scheduledAt: round.endsAt,
});

const worldsSeason: SeasonSummary = {
  id: 7,
  competitionId: 'worlds',
  name: 'Worlds 2026',
  firstMatchAt: round.startsAt,
  lastMatchAt: round.endsAt,
  endsOn: '2026-08-20',
  weekIds: [4],
};

describe('SendRecaps', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let predictions: InMemoryPredictionRepository;
  let publications: InMemoryPublicationRepository;
  let overrides: InMemoryResultOverrideRepository;
  let dispatchLog: InMemoryDispatchLog;
  let messenger: RecordingMessenger;
  let clock: FixedClock;

  const seed = (matches: readonly Match[], frequency: RecapFrequency = 'weekly') => {
    guilds.add(activeGuild('g1', { competitionIds: ['worlds'], recapFrequency: frequency }));
    calendar.matches.splice(0, calendar.matches.length, ...matches);
    calendar.views.splice(0, calendar.views.length, weekView(round, matches, 'Worlds'));
  };
  const predict = async (userId: string, matchId: number, outcome: PredictionOutcome) => {
    await predictions.save({
      guildId: 'g1',
      userId,
      matchId,
      choice: { kind: 'winner', winner: 1 },
      submittedAt: new Date('2026-08-01T00:00:00Z'),
    });
    await predictions.saveOutcomes([{ guildId: 'g1', userId, matchId, outcome }], new Date());
  };
  const run = () =>
    new SendRecaps(
      guilds,
      publications,
      calendar,
      predictions,
      new InMemoryLeaderboardQuery(predictions, calendar),
      overrides,
      dispatchLog,
      messenger,
      COMPETITIONS,
      clock,
      new SilentLogger(),
    ).executeForAll();

  beforeEach(async () => {
    guilds = new InMemoryGuildRepository();
    calendar = new InMemoryCalendarRepository();
    calendar.seasons.push(worldsSeason);
    predictions = new InMemoryPredictionRepository();
    publications = new InMemoryPublicationRepository();
    await publications.reserve('g1', [4], 'channel-1', new Date());
    overrides = new InMemoryResultOverrideRepository();
    dispatchLog = new InMemoryDispatchLog();
    messenger = new RecordingMessenger();
    clock = new FixedClock(new Date('2026-08-08T20:00:00Z'));

    await predict('alice', 1, scored(1));
    await predict('bob', 1, scored(0));
    await predict('alice', 2, scored(1));
    await predict('bob', 2, scored(1));
    await predict('bob', 3, scored(1));
  });

  it('waits for every result of the week', async () => {
    seed([{ ...friday1, ...won }, { ...friday2, ...won }, saturday]);
    await run();
    expect(messenger.matchRecaps).toEqual([]);
  });

  it('recaps the week once, with results, right picks and standings', async () => {
    seed([
      { ...friday1, ...won },
      { ...friday2, ...won },
      { ...saturday, ...won },
    ]);
    await run();
    await run();

    expect(messenger.matchRecaps).toHaveLength(1);
    const [recap] = messenger.matchRecaps;
    expect(recap).toMatchObject({
      guildId: 'g1',
      channelId: 'channel-1',
      kind: 'week',
      competitionName: 'Worlds',
      weekName: 'Round 1',
      startsAt: round.startsAt,
      season: { name: 'Worlds 2026' },
    });
    expect(recap?.matches.map((line) => [line.match.id, line.predictions, line.correctWinners])).toEqual([
      [1, 2, 1],
      [2, 2, 2],
      [3, 1, 1],
    ]);
    expect(recap?.standings.map((entry) => [entry.userId, entry.rank, entry.points])).toEqual([
      ['alice', 1, 2],
      ['bob', 1, 2],
    ]);
    expect(dispatchLog.sent.has('g1:recap:week:4')).toBe(true);
  });

  it('recaps each finished day in daily mode', async () => {
    seed([{ ...friday1, ...won }, { ...friday2, ...won }, saturday], 'daily');
    await run();
    expect(
      messenger.matchRecaps.map((recap) => [recap.kind, recap.matches.map((line) => line.match.id)]),
    ).toEqual([['day', [1, 2]]]);
    expect(messenger.matchRecaps[0]?.standings.map((entry) => entry.userId)).toEqual(['alice', 'bob']);
  });

  it('counts a match cancelled by an admin as resolved', async () => {
    seed([{ ...friday1, ...won }, { ...friday2, ...won }, saturday]);
    await overrides.set('g1', 3, { kind: 'cancelled' });
    await run();
    expect(messenger.matchRecaps[0]?.matches[2]?.outcome).toEqual({ kind: 'void' });
  });

  it('posts nothing when nobody predicted, but does not come back to it', async () => {
    predictions.predictions.splice(0);
    seed([
      { ...friday1, ...won },
      { ...friday2, ...won },
      { ...saturday, ...won },
    ]);
    await run();
    expect(messenger.matchRecaps).toEqual([]);
    expect(dispatchLog.sent.has('g1:recap:week:4')).toBe(true);
  });

  it('skips weeks that ended too long ago', async () => {
    seed([
      { ...friday1, ...won },
      { ...friday2, ...won },
      { ...saturday, ...won },
    ]);
    clock.set(new Date('2026-08-20T00:00:00Z'));
    await run();
    expect(messenger.matchRecaps).toEqual([]);
  });

  it('posts the final standings once the season is over', async () => {
    calendar.seasons.splice(0, 1, { ...worldsSeason, endsOn: '2026-08-08' });
    seed([
      { ...friday1, ...won },
      { ...friday2, ...won },
      { ...saturday, ...won },
    ]);
    await run();
    await run();
    expect(messenger.seasonRecaps).toHaveLength(1);
    expect(messenger.seasonRecaps[0]).toMatchObject({ seasonName: 'Worlds 2026', players: 2 });
    expect(dispatchLog.sent.has('g1:recap:season:7')).toBe(true);
  });

  it('waits for the tournaments end date before closing a season', async () => {
    seed([
      { ...friday1, ...won },
      { ...friday2, ...won },
      { ...saturday, ...won },
    ]);
    await run();
    expect(messenger.seasonRecaps).toEqual([]);
  });

  it('ignores seasons the server never played', async () => {
    publications.publications.clear();
    calendar.seasons.splice(0, 1, { ...worldsSeason, endsOn: '2026-08-08' });
    seed([
      { ...friday1, ...won },
      { ...friday2, ...won },
      { ...saturday, ...won },
    ]);
    await run();
    expect(messenger.seasonRecaps).toEqual([]);
  });

  it('retries on the next run when Discord fails', async () => {
    seed([
      { ...friday1, ...won },
      { ...friday2, ...won },
      { ...saturday, ...won },
    ]);
    messenger.failWith = new Error('Discord down');
    await run();
    expect(dispatchLog.sent.size).toBe(0);
    messenger.failWith = null;
    await run();
    expect(messenger.matchRecaps).toHaveLength(1);
  });
});
