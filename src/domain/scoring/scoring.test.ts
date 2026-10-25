import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING } from '../competition/scoring.js';
import type { PredictionChoice } from '../prediction/prediction-choice.js';
import { outcomeOf } from './match-outcome.js';
import { judgePrediction, pointsFor, sameOutcome } from './score-prediction.js';

const winner = (side: 1 | 2): PredictionChoice => ({ kind: 'winner', winner: side });
const score = (team1: number, team2: number): PredictionChoice => ({
  kind: 'score',
  score: { team1, team2 },
});
const result = (side: 1 | 2, team1?: number, team2?: number) => ({
  winner: side,
  score: team1 === undefined || team2 === undefined ? null : { team1, team2 },
});

describe('pointsFor', () => {
  it('gives 1 point for the right Bo1 winner', () => {
    expect(pointsFor(winner(1), result(1), DEFAULT_SCORING)).toBe(1);
    expect(pointsFor(winner(2), result(1), DEFAULT_SCORING)).toBe(0);
  });

  it('gives 3 points for the exact series score, 1 for the right winner only', () => {
    expect(pointsFor(score(2, 1), result(1, 2, 1), DEFAULT_SCORING)).toBe(3);
    expect(pointsFor(score(2, 0), result(1, 2, 1), DEFAULT_SCORING)).toBe(1);
    expect(pointsFor(score(1, 2), result(1, 2, 1), DEFAULT_SCORING)).toBe(0);
  });

  it('awards the winner only when the final score is unknown (forfeit)', () => {
    expect(pointsFor(score(2, 0), result(1), DEFAULT_SCORING)).toBe(1);
  });

  it('follows per-competition scoring', () => {
    expect(pointsFor(score(3, 2), result(1, 3, 2), { correctWinner: 2, exactScoreBonus: 5 })).toBe(7);
  });
});

describe('outcomeOf', () => {
  const completed = { status: 'completed', result: result(2, 0, 2) } as const;

  it('uses the provider result', () => {
    expect(outcomeOf(completed, null)).toEqual({ kind: 'decided', result: result(2, 0, 2) });
    expect(outcomeOf({ status: 'scheduled', result: null }, null)).toEqual({ kind: 'pending' });
    expect(outcomeOf({ status: 'completed', result: null }, null)).toEqual({ kind: 'pending' });
    expect(outcomeOf({ status: 'nullified', result: null }, null)).toEqual({ kind: 'void' });
  });

  it('lets admins correct or cancel', () => {
    expect(outcomeOf(completed, { kind: 'result', result: result(1, 2, 0) })).toEqual({
      kind: 'decided',
      result: result(1, 2, 0),
    });
    expect(outcomeOf(completed, { kind: 'cancelled' })).toEqual({ kind: 'void' });
    expect(outcomeOf({ status: 'scheduled', result: null }, { kind: 'result', result: result(1) })).toEqual({
      kind: 'decided',
      result: result(1),
    });
  });
});

describe('judgePrediction', () => {
  it('maps outcomes to prediction states', () => {
    expect(judgePrediction(winner(1), { kind: 'pending' }, DEFAULT_SCORING)).toEqual({ status: 'pending' });
    expect(judgePrediction(winner(1), { kind: 'void' }, DEFAULT_SCORING)).toEqual({ status: 'void' });
    expect(judgePrediction(winner(1), { kind: 'decided', result: result(1) }, DEFAULT_SCORING)).toEqual({
      status: 'scored',
      points: 1,
    });
  });

  it('compares outcomes', () => {
    expect(sameOutcome({ status: 'scored', points: 1 }, { status: 'scored', points: 1 })).toBe(true);
    expect(sameOutcome({ status: 'scored', points: 1 }, { status: 'scored', points: 3 })).toBe(false);
    expect(sameOutcome({ status: 'void' }, { status: 'void' })).toBe(true);
    expect(sameOutcome({ status: 'void' }, { status: 'pending' })).toBe(false);
  });
});
