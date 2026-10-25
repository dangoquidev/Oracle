import { winsNeeded, type BestOf } from './best-of.js';

export type Side = 1 | 2;

export interface SeriesScore {
  readonly team1: number;
  readonly team2: number;
}

/** Every final score a series can end on, team 1 wins first, closest results first. */
export function possibleScores(bestOf: BestOf): SeriesScore[] {
  const wins = winsNeeded(bestOf);
  const team1Wins = Array.from({ length: wins }, (_, losses) => ({ team1: wins, team2: losses }));
  const team2Wins = team1Wins.map(({ team1, team2 }) => ({ team1: team2, team2: team1 })).reverse();
  return [...team1Wins, ...team2Wins];
}

export function isFinalScore(score: SeriesScore, bestOf: BestOf): boolean {
  return possibleScores(bestOf).some((candidate) => sameScore(candidate, score));
}

export function sameScore(a: SeriesScore, b: SeriesScore): boolean {
  return a.team1 === b.team1 && a.team2 === b.team2;
}

export function winnerOfScore(score: SeriesScore): Side {
  return score.team1 > score.team2 ? 1 : 2;
}
