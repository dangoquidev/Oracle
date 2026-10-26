import { describe, expect, it } from 'vitest';
import { computePlayerStats, percentage, type StatsPick } from './player-stats.js';

let nextId = 1;
const pick = (overrides: Partial<StatsPick> & { points?: number; exact?: boolean } = {}): StatsPick => {
  const { points = 1, exact = false, ...rest } = overrides;
  const id = nextId++;
  return {
    matchId: id,
    competitionId: 'lec',
    weekId: 1,
    scheduledAt: new Date(Date.UTC(2026, 6, 1, id)),
    bestOf: 1,
    pickedTeamId: 10,
    outcome: { status: 'scored', points, correctWinner: points > 0, exactScore: exact },
    ...rest,
  };
};

describe('computePlayerStats', () => {
  it('sums points, right winners and exact scores', () => {
    const stats = computePlayerStats([
      pick(),
      pick({ points: 0 }),
      pick({ bestOf: 3, points: 3, exact: true }),
      pick({ bestOf: 5, points: 1 }),
    ]);
    expect(stats.record).toEqual({
      points: 5,
      predictions: 4,
      correctWinners: 3,
      exactScores: 1,
      seriesPredictions: 2,
    });
  });

  it('splits the record by competition, most points first', () => {
    const stats = computePlayerStats([
      pick(),
      pick({ competitionId: 'worlds', points: 3, exact: true, bestOf: 3 }),
    ]);
    expect(stats.byCompetition.map((record) => [record.competitionId, record.points])).toEqual([
      ['worlds', 3],
      ['lec', 1],
    ]);
  });

  it('follows right-winner streaks in match order', () => {
    const first = pick({ points: 0, scheduledAt: new Date('2026-07-01') });
    const picks = [
      pick({ scheduledAt: new Date('2026-07-05') }),
      pick({ scheduledAt: new Date('2026-07-02') }),
      pick({ scheduledAt: new Date('2026-07-03') }),
      pick({ points: 0, scheduledAt: new Date('2026-07-04') }),
      first,
      pick({ scheduledAt: new Date('2026-07-06') }),
    ];
    expect(computePlayerStats(picks)).toMatchObject({ currentStreak: 2, bestStreak: 2 });
    expect(computePlayerStats([pick(), pick(), pick(), pick({ points: 0 })])).toMatchObject({
      currentStreak: 0,
      bestStreak: 3,
    });
  });

  it('finds the best week, the latest one on a tie', () => {
    const stats = computePlayerStats([
      pick({ weekId: 1, points: 2 }),
      pick({ weekId: 2, points: 1 }),
      pick({ weekId: 2, points: 1 }),
      pick({ weekId: 3, points: 1 }),
    ]);
    expect(stats.bestWeek).toEqual({ weekId: 2, points: 2 });
    expect(
      computePlayerStats([pick({ weekId: 1, points: 3 }), pick({ weekId: 2, points: 1 })]).bestWeek,
    ).toEqual({
      weekId: 1,
      points: 3,
    });
  });

  it('names the most picked team and how often it delivered', () => {
    const stats = computePlayerStats([
      pick({ pickedTeamId: 10 }),
      pick({ pickedTeamId: 20, points: 0 }),
      pick({ pickedTeamId: 20 }),
      pick({ pickedTeamId: 30 }),
      pick({ pickedTeamId: 30 }),
      pick({ pickedTeamId: null }),
    ]);
    expect(stats.favouriteTeam).toEqual({ teamId: 30, picks: 2, correct: 2 });
  });

  it('has nothing to say without judged predictions', () => {
    expect(computePlayerStats([])).toEqual({
      record: { points: 0, predictions: 0, correctWinners: 0, exactScores: 0, seriesPredictions: 0 },
      byCompetition: [],
      currentStreak: 0,
      bestStreak: 0,
      bestWeek: null,
      favouriteTeam: null,
    });
  });
});

describe('percentage', () => {
  it('rounds and avoids dividing by zero', () => {
    expect(percentage(2, 3)).toBe(67);
    expect(percentage(0, 0)).toBe(0);
  });
});
