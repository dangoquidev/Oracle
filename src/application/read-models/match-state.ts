import { isLockedAt } from '../../domain/lock/lock-policy.js';
import type { MatchView } from './views.js';

/** Where a match stands for predictions on a server. */
export type MatchPredictionState = 'open' | 'locked' | 'awaiting-opponents' | 'closed';

export function predictionStateOf(match: MatchView, lockAt: Date, now: Date): MatchPredictionState {
  if (match.status !== 'scheduled') return 'closed';
  if (match.team1 === null || match.team2 === null) return 'awaiting-opponents';
  return isLockedAt(lockAt, now) ? 'locked' : 'open';
}

/** Votes stay hidden while a match can still be predicted. */
export function areVotesVisible(state: MatchPredictionState): boolean {
  return state === 'locked' || state === 'closed';
}
