import type { MatchId, WeekId } from '../shared/ids.js';
import { localDateOf } from '../shared/time-zone.js';

export type LockMode = 'per-day' | 'per-match';

export interface LockPolicy {
  readonly mode: LockMode;
  readonly offsetMinutes: number;
}

export const DEFAULT_LOCK_POLICY: LockPolicy = { mode: 'per-day', offsetMinutes: 120 };

export interface LockableMatch {
  readonly id: MatchId;
  readonly weekId: WeekId;
  readonly matchDay: number | null;
  readonly scheduledAt: Date;
}

const MINUTE_MS = 60_000;

/**
 * Instant after which predictions on `match` are refused.
 * Per-day mode locks every match of a day at `offset` before that day's first match;
 * a "day" is the provider's match day within the week, or the local calendar date when unknown.
 */
export function computeLockAt(
  match: LockableMatch,
  weekMatches: readonly LockableMatch[],
  policy: LockPolicy,
  timeZone: string,
): Date {
  const anchor =
    policy.mode === 'per-match' ? match.scheduledAt : firstMatchOfDay(match, weekMatches, timeZone);
  return new Date(anchor.getTime() - policy.offsetMinutes * MINUTE_MS);
}

function firstMatchOfDay(
  match: LockableMatch,
  weekMatches: readonly LockableMatch[],
  timeZone: string,
): Date {
  const sameDay = weekMatches.filter(
    (other) => other.weekId === match.weekId && isSameDay(match, other, timeZone),
  );
  return new Date(
    Math.min(match.scheduledAt.getTime(), ...sameDay.map((other) => other.scheduledAt.getTime())),
  );
}

function isSameDay(a: LockableMatch, b: LockableMatch, timeZone: string): boolean {
  if (a.matchDay !== null && b.matchDay !== null) return a.matchDay === b.matchDay;
  return localDateOf(a.scheduledAt, timeZone) === localDateOf(b.scheduledAt, timeZone);
}

export function isLockedAt(lockAt: Date, instant: Date): boolean {
  return instant.getTime() >= lockAt.getTime();
}
