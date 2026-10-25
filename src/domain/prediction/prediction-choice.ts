import type { BestOf } from '../match/best-of.js';
import {
  isFinalScore,
  possibleScores,
  sameScore,
  winnerOfScore,
  type SeriesScore,
  type Side,
} from '../match/series-score.js';

/** Bo1: pick the winner. Bo3/Bo5: pick the exact series score (which implies the winner). */
export type PredictionChoice =
  | { readonly kind: 'winner'; readonly winner: Side }
  | { readonly kind: 'score'; readonly score: SeriesScore };

export function choicesFor(bestOf: BestOf): PredictionChoice[] {
  if (bestOf === 1) {
    return [
      { kind: 'winner', winner: 1 },
      { kind: 'winner', winner: 2 },
    ];
  }
  return possibleScores(bestOf).map((score) => ({ kind: 'score', score }));
}

export function isChoiceValidFor(choice: PredictionChoice, bestOf: BestOf): boolean {
  return choice.kind === 'winner' ? bestOf === 1 : bestOf !== 1 && isFinalScore(choice.score, bestOf);
}

export function predictedWinner(choice: PredictionChoice): Side {
  return choice.kind === 'winner' ? choice.winner : winnerOfScore(choice.score);
}

export function sameChoice(a: PredictionChoice, b: PredictionChoice): boolean {
  if (a.kind === 'winner') return b.kind === 'winner' && a.winner === b.winner;
  return b.kind === 'score' && sameScore(a.score, b.score);
}
