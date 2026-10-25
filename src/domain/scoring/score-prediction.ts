import type { ScoringRules } from '../competition/scoring.js';
import type { MatchResult } from '../match/match.js';
import { sameScore } from '../match/series-score.js';
import { predictedWinner, type PredictionChoice } from '../prediction/prediction-choice.js';
import type { MatchOutcome } from './match-outcome.js';

export type PredictionOutcome =
  | { readonly status: 'pending' }
  | { readonly status: 'void' }
  | { readonly status: 'scored'; readonly points: number };

/**
 * Right winner earns `correctWinner`; the exact series score adds `exactScoreBonus`
 * (only when the final score is known, e.g. not for a forfeit).
 */
export function pointsFor(choice: PredictionChoice, result: MatchResult, rules: ScoringRules): number {
  if (predictedWinner(choice) !== result.winner) return 0;
  const exact = choice.kind === 'score' && result.score !== null && sameScore(choice.score, result.score);
  return rules.correctWinner + (exact ? rules.exactScoreBonus : 0);
}

export function judgePrediction(
  choice: PredictionChoice,
  outcome: MatchOutcome,
  rules: ScoringRules,
): PredictionOutcome {
  if (outcome.kind === 'pending') return { status: 'pending' };
  if (outcome.kind === 'void') return { status: 'void' };
  return { status: 'scored', points: pointsFor(choice, outcome.result, rules) };
}

export function sameOutcome(a: PredictionOutcome, b: PredictionOutcome): boolean {
  if (a.status !== b.status) return false;
  return a.status !== 'scored' || (b.status === 'scored' && a.points === b.points);
}
