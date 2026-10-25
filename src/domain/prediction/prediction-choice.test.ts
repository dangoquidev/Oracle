import { describe, expect, it } from 'vitest';
import {
  choicesFor,
  isChoiceValidFor,
  predictedWinner,
  sameChoice,
  type PredictionChoice,
} from './prediction-choice.js';

const winner = (side: 1 | 2): PredictionChoice => ({ kind: 'winner', winner: side });
const score = (team1: number, team2: number): PredictionChoice => ({
  kind: 'score',
  score: { team1, team2 },
});

describe('prediction choices', () => {
  it('offers the winner only for Bo1', () => {
    expect(choicesFor(1)).toEqual([winner(1), winner(2)]);
  });

  it('offers exact scores for Bo3 and Bo5', () => {
    expect(choicesFor(3)).toEqual([score(2, 0), score(2, 1), score(1, 2), score(0, 2)]);
    expect(choicesFor(5)).toHaveLength(6);
  });

  it('validates a choice against the format', () => {
    expect(isChoiceValidFor(winner(1), 1)).toBe(true);
    expect(isChoiceValidFor(winner(1), 3)).toBe(false);
    expect(isChoiceValidFor(score(2, 1), 3)).toBe(true);
    expect(isChoiceValidFor(score(2, 1), 5)).toBe(false);
    expect(isChoiceValidFor(score(1, 0), 1)).toBe(false);
  });

  it('derives the predicted winner', () => {
    expect(predictedWinner(winner(2))).toBe(2);
    expect(predictedWinner(score(3, 1))).toBe(1);
    expect(predictedWinner(score(1, 2))).toBe(2);
  });

  it('compares choices', () => {
    expect(sameChoice(winner(1), winner(1))).toBe(true);
    expect(sameChoice(winner(1), winner(2))).toBe(false);
    expect(sameChoice(winner(1), score(2, 0))).toBe(false);
    expect(sameChoice(score(2, 0), score(2, 0))).toBe(true);
    expect(sameChoice(score(2, 0), winner(1))).toBe(false);
  });
});
