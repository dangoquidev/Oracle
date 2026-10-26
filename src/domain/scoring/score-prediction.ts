import type { ScoringRules } from '../competition/scoring.js';
import type { MatchResult } from '../match/match.js';
import { sameScore } from '../match/series-score.js';
import { predictedWinner, type PredictionChoice } from '../prediction/prediction-choice.js';
import type { MatchOutcome } from './match-outcome.js';

export type PredictionOutcome =
  | { readonly status: 'pending' }
  | { readonly status: 'void' }
  | {
      readonly status: 'scored';
      readonly points: number;
      readonly correctWinner: boolean;
      readonly exactScore: boolean;
    };

export type ScoredOutcome = Extract<PredictionOutcome, { status: 'scored' }>;

/**
 * Right winner earns `correctWinner`; the exact series score adds `exactScoreBonus`
 * (only when the final score is known, e.g. not for a forfeit).
 */
export function scoreChoice(
  choice: PredictionChoice,
  result: MatchResult,
  rules: ScoringRules,
): ScoredOutcome {
  const correctWinner = predictedWinner(choice) === result.winner;
  const exactScore =
    correctWinner &&
    choice.kind === 'score' &&
    result.score !== null &&
    sameScore(choice.score, result.score);
  const points = correctWinner ? rules.correctWinner + (exactScore ? rules.exactScoreBonus : 0) : 0;
  return { status: 'scored', points, correctWinner, exactScore };
}

export function pointsFor(choice: PredictionChoice, result: MatchResult, rules: ScoringRules): number {
  return scoreChoice(choice, result, rules).points;
}

export function judgePrediction(
  choice: PredictionChoice,
  outcome: MatchOutcome,
  rules: ScoringRules,
): PredictionOutcome {
  if (outcome.kind === 'pending') return { status: 'pending' };
  if (outcome.kind === 'void') return { status: 'void' };
  return scoreChoice(choice, outcome.result, rules);
}

export function sameOutcome(a: PredictionOutcome, b: PredictionOutcome): boolean {
  if (a.status !== 'scored' || b.status !== 'scored') return a.status === b.status;
  return a.points === b.points && a.correctWinner === b.correctWinner && a.exactScore === b.exactScore;
}
