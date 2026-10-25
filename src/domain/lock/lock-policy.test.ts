import { describe, expect, it } from 'vitest';
import { computeLockAt, isLockedAt, type LockableMatch } from './lock-policy.js';

const at = (iso: string) => new Date(iso);
const match = (id: number, iso: string, matchDay: number | null, weekId = 1): LockableMatch => ({
  id,
  weekId,
  matchDay,
  scheduledAt: at(iso),
});

describe('computeLockAt', () => {
  const day1Early = match(1, '2026-08-01T15:00:00Z', 1);
  const day1Late = match(2, '2026-08-01T18:00:00Z', 1);
  const day2 = match(3, '2026-08-02T15:00:00Z', 2);
  const otherWeek = match(4, '2026-08-01T12:00:00Z', 1, 2);
  const week = [day1Early, day1Late, day2, otherWeek];

  it('locks every match of a match day before its first match', () => {
    const policy = { mode: 'per-day', offsetMinutes: 120 } as const;
    expect(computeLockAt(day1Late, week, policy, 'Europe/Paris')).toEqual(at('2026-08-01T13:00:00Z'));
    expect(computeLockAt(day1Early, week, policy, 'Europe/Paris')).toEqual(at('2026-08-01T13:00:00Z'));
    expect(computeLockAt(day2, week, policy, 'Europe/Paris')).toEqual(at('2026-08-02T13:00:00Z'));
  });

  it('locks each match on its own in per-match mode', () => {
    const policy = { mode: 'per-match', offsetMinutes: 30 } as const;
    expect(computeLockAt(day1Late, week, policy, 'Europe/Paris')).toEqual(at('2026-08-01T17:30:00Z'));
  });

  it('falls back to the local calendar date when match days are unknown', () => {
    const policy = { mode: 'per-day', offsetMinutes: 60 } as const;
    // 23:30 UTC on the 1st is already the 2nd in Paris, so it shares a day with the 2nd's matches.
    const lateNight = match(10, '2026-08-01T22:30:00Z', null);
    const nextMorning = match(11, '2026-08-02T10:00:00Z', null);
    expect(computeLockAt(nextMorning, [lateNight, nextMorning], policy, 'Europe/Paris')).toEqual(
      at('2026-08-01T21:30:00Z'),
    );
    expect(computeLockAt(nextMorning, [lateNight, nextMorning], policy, 'UTC')).toEqual(
      at('2026-08-02T09:00:00Z'),
    );
  });
});

describe('isLockedAt', () => {
  it('is locked from the lock instant on', () => {
    const lockAt = at('2026-08-01T13:00:00Z');
    expect(isLockedAt(lockAt, at('2026-08-01T12:59:59Z'))).toBe(false);
    expect(isLockedAt(lockAt, lockAt)).toBe(true);
  });
});
