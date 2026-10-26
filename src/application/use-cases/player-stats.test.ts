import { beforeEach, describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../config/competitions.js';
import type { PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import type { PredictionOutcome } from '../../domain/scoring/score-prediction.js';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryBanRepository,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryLeaderboardQuery,
  InMemoryPredictionRepository,
} from '../../test-support/fakes.js';
import { StandingsReader } from '../read-models/standings.js';
import { GetPlayerStats } from './get-player-stats.js';

const scored = (points: number, exactScore = false): PredictionOutcome => ({
  status: 'scored',
  points,
  correctWinner: points > 0,
  exactScore,
});

// LEC Summer: week 1 (two Bo1) and week 2 (one Bo3); Worlds: one Bo1.
const week1 = week({ id: 1, name: 'Week 1' });
const week2 = week({ id: 2, name: 'Week 2', startsAt: new Date('2026-08-08T16:00:00Z') });
const worldsWeek = week({
  id: 3,
  competitionId: 'worlds',
  name: 'Round 1',
  startsAt: new Date('2026-10-01'),
});
const m1 = match({ id: 1, weekId: 1, scheduledAt: new Date('2026-08-01T16:00:00Z') });
const m2 = match({ id: 2, weekId: 1, scheduledAt: new Date('2026-08-01T18:00:00Z'), team1Id: 30 });
const m3 = match({ id: 3, weekId: 2, scheduledAt: new Date('2026-08-08T16:00:00Z'), bestOf: 3 });
const m4 = match({
  id: 4,
  weekId: 3,
  competitionId: 'worlds',
  scheduledAt: new Date('2026-10-01T10:00:00Z'),
});
const m5 = match({
  id: 5,
  weekId: 3,
  competitionId: 'worlds',
  scheduledAt: new Date('2026-10-02T10:00:00Z'),
});

describe('GetPlayerStats', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let predictions: InMemoryPredictionRepository;
  let bans: InMemoryBanRepository;

  const predict = async (
    userId: string,
    matchId: number,
    choice: PredictionChoice,
    outcome: PredictionOutcome,
  ) => {
    await predictions.save({ guildId: 'g1', userId, matchId, choice, submittedAt: new Date('2026-07-01') });
    await predictions.saveOutcomes([{ guildId: 'g1', userId, matchId, outcome }], new Date());
  };
  const stats = (userId = 'alice') =>
    new GetPlayerStats(
      guilds,
      predictions,
      calendar,
      new StandingsReader(new InMemoryLeaderboardQuery(predictions, calendar), bans),
      bans,
      COMPETITIONS,
      new FixedClock(new Date('2026-10-03T00:00:00Z')),
    ).execute('g1', userId);

  beforeEach(async () => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1', { competitionIds: ['lec', 'worlds'] }));
    calendar = new InMemoryCalendarRepository();
    calendar.matches.push(m1, m2, m3, m4, m5);
    calendar.views.push(
      weekView(week1, [m1, m2]),
      weekView(week2, [m3]),
      weekView(worldsWeek, [m4, m5], 'Worlds'),
    );
    calendar.seasons.push(
      {
        id: 1,
        competitionId: 'lec',
        name: 'LEC 2026 Summer',
        firstMatchAt: m1.scheduledAt,
        lastMatchAt: m3.scheduledAt,
        endsOn: '2026-08-30',
        weekIds: [1, 2],
      },
      {
        id: 2,
        competitionId: 'worlds',
        name: 'Worlds 2026',
        firstMatchAt: m4.scheduledAt,
        lastMatchAt: m5.scheduledAt,
        endsOn: null,
        weekIds: [3],
      },
    );
    predictions = new InMemoryPredictionRepository();
    bans = new InMemoryBanRepository();

    const team1 = { kind: 'winner', winner: 1 } as const;
    await predict('alice', 1, team1, scored(1));
    await predict('alice', 2, team1, scored(0));
    await predict('alice', 3, { kind: 'score', score: { team1: 2, team2: 0 } }, scored(3, true));
    await predict('alice', 4, { kind: 'winner', winner: 2 }, scored(1));
    await predict('alice', 5, team1, { status: 'void' });
    await predict('bob', 1, team1, scored(1));
    await predict('bob', 4, team1, scored(0));
  });

  it('sums up the player record, streaks and rankings', async () => {
    const result = await stats();
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      locale: 'fr',
      userId: 'alice',
      banned: false,
      record: { points: 5, predictions: 4, correctWinners: 3, exactScores: 1, seriesPredictions: 1 },
      currentStreak: 2,
      bestStreak: 2,
      allTime: { rank: 1, players: 2, points: 5 },
      seasons: [
        { name: 'LEC 2026 Summer', rank: 1, players: 2, points: 4 },
        { name: 'Worlds 2026', rank: 1, players: 2, points: 1 },
      ],
      competitions: [
        { name: 'LEC', points: 4, predictions: 3 },
        { name: 'Worlds', points: 1, predictions: 1 },
      ],
      bestWeek: { competitionName: 'LEC', weekName: 'Week 2', points: 3 },
    });
    // Team 10 was picked twice (matches 1 and 3), team 30 once, team 20 once.
    expect(result.value.favouriteTeam).toEqual({
      team: { id: 10, name: 'T10', shortName: 'T10', emojiId: null },
      picks: 2,
      correct: 2,
    });
  });

  it('describes a player without judged predictions', async () => {
    const result = await stats('carol');
    expect(result.ok && result.value).toMatchObject({
      record: { predictions: 0 },
      allTime: null,
      seasons: [],
      competitions: [],
      bestWeek: null,
      favouriteTeam: null,
    });
  });

  it('keeps the history of banned players but leaves them unranked', async () => {
    await bans.ban({ guildId: 'g1', userId: 'alice', bannedBy: 'admin', reason: null, bannedAt: new Date() });
    const result = await stats();
    expect(result.ok && result.value).toMatchObject({
      banned: true,
      record: { points: 5 },
      allTime: null,
      seasons: [],
    });
  });

  it('refuses inactive servers', async () => {
    guilds.add({ ...activeGuild('g1'), status: 'paused' });
    expect(await stats()).toEqual({ ok: false, error: 'guild-not-active' });
  });
});
