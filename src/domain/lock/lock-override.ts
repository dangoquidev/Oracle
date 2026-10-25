/** An admin decision overriding the computed lock of one match on one server. */
export interface LockOverride {
  readonly state: 'open' | 'closed';
  readonly at: Date;
}

/**
 * Lock instant once admin overrides are applied.
 * Forced open: votes stay open until the match starts (never during a match).
 * Forced closed: votes close when the admin closed them, unless the computed lock came first.
 */
export function effectiveLockAt(
  computedLockAt: Date,
  scheduledAt: Date,
  override: LockOverride | null,
): Date {
  if (!override) return computedLockAt;
  if (override.state === 'open') return scheduledAt;
  return new Date(Math.min(computedLockAt.getTime(), override.at.getTime()));
}
