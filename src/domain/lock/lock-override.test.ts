import { describe, expect, it } from 'vitest';
import { effectiveLockAt } from './lock-override.js';

const computed = new Date('2026-08-01T14:00:00Z');
const start = new Date('2026-08-01T16:00:00Z');

describe('effectiveLockAt', () => {
  it('keeps the computed lock without override', () => {
    expect(effectiveLockAt(computed, start, null)).toEqual(computed);
  });

  it('reopens votes until the match starts', () => {
    expect(effectiveLockAt(computed, start, { state: 'open', at: new Date('2026-08-01T14:30:00Z') })).toEqual(
      start,
    );
  });

  it('closes votes early when an admin closes them', () => {
    const at = new Date('2026-08-01T10:00:00Z');
    expect(effectiveLockAt(computed, start, { state: 'closed', at })).toEqual(at);
  });

  it('never delays the computed lock when closing late', () => {
    const at = new Date('2026-08-01T15:00:00Z');
    expect(effectiveLockAt(computed, start, { state: 'closed', at })).toEqual(computed);
  });
});
