import { isLockedAt } from '../../domain/lock/lock-policy.js';
import { outcomeOf, type MatchOutcome, type ResultOverride } from '../../domain/scoring/match-outcome.js';
import type { MatchView } from './views.js';

/** Where a match stands for predictions on a server. */
export type MatchPredictionState = 'open' | 'locked' | 'awaiting-opponents' | 'closed' | 'cancelled';

export interface MatchStanding {
  readonly state: MatchPredictionState;
  readonly outcome: MatchOutcome;
}

export function standingOf(
  match: MatchView,
  lockAt: Date,
  now: Date,
  override: ResultOverride | null,
): MatchStanding {
  const outcome = outcomeOf(match, override);
  return { outcome, state: stateOf(match, outcome, lockAt, now) };
}

function stateOf(match: MatchView, outcome: MatchOutcome, lockAt: Date, now: Date): MatchPredictionState {
  if (outcome.kind === 'void') return 'cancelled';
  if (match.status !== 'scheduled' || outcome.kind === 'decided') return 'closed';
  if (match.team1 === null || match.team2 === null) return 'awaiting-opponents';
  return isLockedAt(lockAt, now) ? 'locked' : 'open';
}

/** Votes stay hidden while a match can still be predicted. */
export function areVotesVisible(state: MatchPredictionState): boolean {
  return state === 'locked' || state === 'closed';
}
