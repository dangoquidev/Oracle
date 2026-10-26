import type { UserId } from '../shared/ids.js';

/** What a player earned over a set of judged predictions (cancelled matches excluded). */
export interface PlayerTally {
  readonly userId: UserId;
  readonly points: number;
  /** Judged predictions. */
  readonly predictions: number;
  readonly correctWinners: number;
  readonly exactScores: number;
}

export interface LeaderboardEntry extends PlayerTally {
  /** Standard competition ranking: players tied on points share a rank (1, 1, 3). */
  readonly rank: number;
}

/** Ranks by points; ties stay tied (no tie-break), their display order is only made stable. */
export function rankTallies(tallies: readonly PlayerTally[]): LeaderboardEntry[] {
  const ordered = tallies.toSorted((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
  let rank = 0;
  return ordered.map((tally, index) => {
    if (ordered[index - 1]?.points !== tally.points) rank = index + 1;
    return { ...tally, rank };
  });
}
