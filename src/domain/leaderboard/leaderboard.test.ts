import { describe, expect, it } from 'vitest';
import { rankTallies, type PlayerTally } from './leaderboard.js';

const tally = (userId: string, points: number): PlayerTally => ({
  userId,
  points,
  predictions: 5,
  correctWinners: points,
  exactScores: 0,
});

describe('rankTallies', () => {
  it('orders by points and shares ranks on ties (1, 1, 3)', () => {
    const ranked = rankTallies([tally('c', 4), tally('a', 7), tally('d', 2), tally('b', 7)]);
    expect(ranked.map((entry) => [entry.userId, entry.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('keeps everyone tied when nobody scored', () => {
    expect(rankTallies([tally('b', 0), tally('a', 0)]).map((entry) => entry.rank)).toEqual([1, 1]);
  });

  it('handles an empty board', () => {
    expect(rankTallies([])).toEqual([]);
  });
});
