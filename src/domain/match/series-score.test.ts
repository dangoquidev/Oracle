import { describe, expect, it } from 'vitest';
import { parseBestOf, winsNeeded } from './best-of.js';
import { isFinalScore, possibleScores, sameScore, winnerOfScore } from './series-score.js';

describe('best-of', () => {
  it('parses supported formats only', () => {
    expect([1, 3, 5].map(parseBestOf)).toEqual([1, 3, 5]);
    expect([0, 2, 7].map(parseBestOf)).toEqual([null, null, null]);
  });

  it('computes wins needed', () => {
    expect([winsNeeded(1), winsNeeded(3), winsNeeded(5)]).toEqual([1, 2, 3]);
  });
});

describe('series score', () => {
  it('lists Bo3 final scores, team 1 wins first', () => {
    expect(possibleScores(3)).toEqual([
      { team1: 2, team2: 0 },
      { team1: 2, team2: 1 },
      { team1: 1, team2: 2 },
      { team1: 0, team2: 2 },
    ]);
  });

  it('lists six Bo5 final scores', () => {
    expect(possibleScores(5)).toHaveLength(6);
    expect(possibleScores(5)).toContainEqual({ team1: 3, team2: 2 });
  });

  it('recognises final scores', () => {
    expect(isFinalScore({ team1: 2, team2: 1 }, 3)).toBe(true);
    expect(isFinalScore({ team1: 1, team2: 1 }, 3)).toBe(false);
    expect(isFinalScore({ team1: 3, team2: 0 }, 3)).toBe(false);
  });

  it('compares scores and derives the winner', () => {
    expect(sameScore({ team1: 2, team2: 1 }, { team1: 2, team2: 1 })).toBe(true);
    expect(sameScore({ team1: 2, team2: 1 }, { team1: 1, team2: 2 })).toBe(false);
    expect(winnerOfScore({ team1: 0, team2: 3 })).toBe(2);
    expect(winnerOfScore({ team1: 2, team2: 0 })).toBe(1);
  });
});
