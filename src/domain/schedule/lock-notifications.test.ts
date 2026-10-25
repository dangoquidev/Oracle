import { describe, expect, it } from 'vitest';
import { notificationKeys, planLockNotifications, type NotifiableMatch } from './lock-notifications.js';

const lock = new Date('2026-08-01T14:00:00Z');
const match = (id: number, overrides: Partial<NotifiableMatch> = {}): NotifiableMatch => ({
  id,
  weekId: 1,
  lockAt: lock,
  predictable: true,
  ...overrides,
});
const reminders = { enabled: true, offsetMinutes: 60 };
const at = (iso: string) => new Date(iso);

describe('planLockNotifications', () => {
  const matches = [
    match(1),
    match(2),
    match(3, { lockAt: at('2026-08-02T14:00:00Z') }),
    match(4, { predictable: false }),
  ];

  it('reminds once per lock group within the reminder window', () => {
    const plan = planLockNotifications(matches, reminders, at('2026-08-01T13:10:00Z'), new Set());
    expect(plan.reminders).toEqual([
      { key: `reminder:1:${lock.getTime()}`, weekId: 1, lockAt: lock, matchIds: [1, 2] },
    ]);
    expect(plan.reveals).toEqual([]);
  });

  it('does not remind before the window, after the lock, when disabled or already sent', () => {
    expect(
      planLockNotifications(matches, reminders, at('2026-08-01T12:59:00Z'), new Set()).reminders,
    ).toEqual([]);
    expect(
      planLockNotifications(matches, reminders, at('2026-08-01T14:00:00Z'), new Set()).reminders,
    ).toEqual([]);
    expect(
      planLockNotifications(
        matches,
        { enabled: false, offsetMinutes: 60 },
        at('2026-08-01T13:30:00Z'),
        new Set(),
      ).reminders,
    ).toEqual([]);
    const sent = new Set([`reminder:1:${lock.getTime()}`]);
    expect(planLockNotifications(matches, reminders, at('2026-08-01T13:30:00Z'), sent).reminders).toEqual([]);
  });

  it('reveals votes once the group is locked, within the grace period', () => {
    const plan = planLockNotifications(matches, reminders, at('2026-08-01T14:00:00Z'), new Set());
    expect(plan.reveals.map((group) => group.matchIds)).toEqual([[1, 2]]);
    expect(planLockNotifications(matches, reminders, at('2026-08-01T20:00:00Z'), new Set()).reveals).toEqual(
      [],
    );
    const sent = new Set([`reveal:1:${lock.getTime()}`]);
    expect(planLockNotifications(matches, reminders, at('2026-08-01T15:00:00Z'), sent).reveals).toEqual([]);
  });

  it('keeps groups of different weeks apart', () => {
    const plan = planLockNotifications([match(1), match(2, { weekId: 2 })], reminders, lock, new Set());
    expect(plan.reveals.map((group) => group.weekId)).toEqual([1, 2]);
  });

  it('lists every possible key for lookup', () => {
    expect(notificationKeys([match(1), match(2)])).toEqual([
      `reminder:1:${lock.getTime()}`,
      `reveal:1:${lock.getTime()}`,
    ]);
  });
});
