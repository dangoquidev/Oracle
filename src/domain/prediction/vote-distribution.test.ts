import { describe, expect, it } from 'vitest';
import type { PredictionChoice } from './prediction-choice.js';
import { distributionOf } from './vote-distribution.js';

const winner = (side: 1 | 2): PredictionChoice => ({ kind: 'winner', winner: side });
const score = (team1: number, team2: number): PredictionChoice => ({
  kind: 'score',
  score: { team1, team2 },
});

describe('distributionOf', () => {
  it('is empty without votes', () => {
    expect(distributionOf([], 3)).toEqual({ total: 0, team1Percent: 0, team2Percent: 0, topScore: null });
  });

  it('splits Bo1 votes between teams, summing to 100', () => {
    expect(distributionOf([winner(1), winner(1), winner(2)], 1)).toEqual({
      total: 3,
      team1Percent: 67,
      team2Percent: 33,
      topScore: null,
    });
  });

  it('derives winners from scores and finds the most picked score', () => {
    const result = distributionOf([score(2, 1), score(2, 1), score(2, 0), score(0, 2)], 3);
    expect(result).toEqual({
      total: 4,
      team1Percent: 75,
      team2Percent: 25,
      topScore: { score: { team1: 2, team2: 1 }, percent: 50 },
    });
  });

  it('keeps the first score on ties', () => {
    expect(distributionOf([score(3, 0), score(1, 3)], 5).topScore).toEqual({
      score: { team1: 3, team2: 0 },
      percent: 50,
    });
  });

  it('ignores stray winner picks when looking for the top score', () => {
    expect(distributionOf([winner(1)], 3).topScore).toBeNull();
  });
});
