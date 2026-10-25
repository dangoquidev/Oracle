import type { Match, MatchResult } from '../match/match.js';

/** An admin decision on a match result, for one server. */
export type ResultOverride =
  { readonly kind: 'cancelled' } | { readonly kind: 'result'; readonly result: MatchResult };

/**
 * What predictions on a match are judged against:
 * pending until a result is known, void when the match is cancelled (predictions ignored).
 */
export type MatchOutcome =
  | { readonly kind: 'pending' }
  | { readonly kind: 'void' }
  | { readonly kind: 'decided'; readonly result: MatchResult };

/** Admin overrides win over the provider; a result nullified by the provider voids predictions. */
export function outcomeOf(
  match: Pick<Match, 'status' | 'result'>,
  override: ResultOverride | null,
): MatchOutcome {
  if (override?.kind === 'cancelled') return { kind: 'void' };
  if (override?.kind === 'result') return { kind: 'decided', result: override.result };
  if (match.status === 'nullified') return { kind: 'void' };
  if (match.status === 'completed' && match.result) return { kind: 'decided', result: match.result };
  return { kind: 'pending' };
}
