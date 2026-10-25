import type { BestOf } from '../match/best-of.js';
import { sameScore, type SeriesScore } from '../match/series-score.js';
import { predictedWinner, type PredictionChoice } from './prediction-choice.js';

export interface VoteDistribution {
  readonly total: number;
  /** Share of votes for each side, in whole percents summing to 100 (0/0 without votes). */
  readonly team1Percent: number;
  readonly team2Percent: number;
  /** Most picked exact score for Bo3/Bo5, ties broken by the first in display order. */
  readonly topScore: { readonly score: SeriesScore; readonly percent: number } | null;
}

export function distributionOf(choices: readonly PredictionChoice[], bestOf: BestOf): VoteDistribution {
  const total = choices.length;
  if (total === 0) return { total: 0, team1Percent: 0, team2Percent: 0, topScore: null };

  const team1Votes = choices.filter((choice) => predictedWinner(choice) === 1).length;
  const team1Percent = Math.round((team1Votes / total) * 100);
  return {
    total,
    team1Percent,
    team2Percent: 100 - team1Percent,
    topScore: bestOf === 1 ? null : topScoreOf(choices, total),
  };
}

function topScoreOf(choices: readonly PredictionChoice[], total: number): VoteDistribution['topScore'] {
  const counts: { score: SeriesScore; count: number }[] = [];
  for (const choice of choices) {
    if (choice.kind !== 'score') continue;
    const entry = counts.find((candidate) => sameScore(candidate.score, choice.score));
    if (entry) entry.count += 1;
    else counts.push({ score: choice.score, count: 1 });
  }
  const best = counts.reduce<{ score: SeriesScore; count: number } | null>(
    (top, entry) => (top === null || entry.count > top.count ? entry : top),
    null,
  );
  return best ? { score: best.score, percent: Math.round((best.count / total) * 100) } : null;
}
