import { describe, expect, it } from 'vitest';
import { completedRecapGroups, RECAP_WINDOW_MS, type RecapMatch } from './recap-plan.js';

const match = (id: number, at: string, overrides: Partial<RecapMatch> = {}): RecapMatch => ({
  id,
  weekId: 1,
  matchDay: null,
  scheduledAt: new Date(at),
  resolved: true,
  ...overrides,
});

// Friday 18:00 and 21:00 Paris, then Saturday 18:00 Paris.
const friday1 = match(1, '2026-08-07T16:00:00Z');
const friday2 = match(2, '2026-08-07T19:00:00Z');
const saturday = match(3, '2026-08-08T16:00:00Z');
const later = new Date('2026-08-08T22:00:00Z');

describe('completedRecapGroups', () => {
  it('recaps a week once all its matches are resolved', () => {
    expect(completedRecapGroups([friday1, friday2, saturday], 'weekly', 'Europe/Paris', later)).toEqual([
      {
        key: 'recap:week:1',
        kind: 'week',
        weekId: 1,
        matchIds: [1, 2, 3],
        startsAt: friday1.scheduledAt,
        endsAt: saturday.scheduledAt,
      },
    ]);
    const pending = { ...saturday, resolved: false };
    expect(completedRecapGroups([friday1, friday2, pending], 'weekly', 'Europe/Paris', later)).toEqual([]);
  });

  it('recaps each local day separately in daily mode', () => {
    const pending = { ...saturday, resolved: false };
    const groups = completedRecapGroups([friday2, friday1, pending], 'daily', 'Europe/Paris', later);
    expect(groups.map((group) => [group.key, group.matchIds])).toEqual([['recap:day:1:2026-08-07', [1, 2]]]);
  });

  it('prefers the provider match day over the local date', () => {
    const groups = completedRecapGroups(
      [match(1, '2026-08-07T22:30:00Z', { matchDay: 2 }), match(2, '2026-08-08T01:00:00Z', { matchDay: 2 })],
      'daily',
      'Europe/Paris',
      later,
    );
    expect(groups.map((group) => group.key)).toEqual(['recap:day:1:2']);
  });

  it('ignores groups not played yet or too old', () => {
    const cancelledAhead = match(4, '2026-08-20T16:00:00Z', { weekId: 2 });
    expect(completedRecapGroups([cancelledAhead], 'weekly', 'UTC', later)).toEqual([]);
    const stale = new Date(saturday.scheduledAt.getTime() + RECAP_WINDOW_MS + 1);
    expect(completedRecapGroups([saturday], 'weekly', 'UTC', stale)).toEqual([]);
  });
});
