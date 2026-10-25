import type { ReminderSettings } from '../guild/guild-settings.js';
import type { MatchId, WeekId } from '../shared/ids.js';

export interface NotifiableMatch {
  readonly id: MatchId;
  readonly weekId: WeekId;
  /** Effective lock instant (overrides applied). */
  readonly lockAt: Date;
  /** Both opponents known and not played yet: worth reminding about. */
  readonly predictable: boolean;
}

/** Matches of one week closing at the same instant: announced together. */
export interface LockGroup {
  readonly key: string;
  readonly weekId: WeekId;
  readonly lockAt: Date;
  readonly matchIds: readonly MatchId[];
}

export interface LockNotificationPlan {
  readonly reminders: readonly LockGroup[];
  readonly reveals: readonly LockGroup[];
}

const MINUTE_MS = 60_000;
/** Vote distributions are only revealed shortly after the lock, not hours later after downtime. */
export const REVEAL_GRACE_MS = 6 * 60 * MINUTE_MS;

/**
 * Which reminders and vote reveals are due now. Keys identify each notification so it is sent once
 * (a moved match gets a new lock instant, hence a new key).
 */
export function planLockNotifications(
  matches: readonly NotifiableMatch[],
  reminders: ReminderSettings,
  now: Date,
  alreadySent: ReadonlySet<string>,
): LockNotificationPlan {
  const groups = groupByLock(matches.filter((match) => match.predictable));
  const time = now.getTime();

  const dueReminders = reminders.enabled
    ? groups
        .filter(
          ({ lockAt }) =>
            time >= lockAt.getTime() - reminders.offsetMinutes * MINUTE_MS && time < lockAt.getTime(),
        )
        .map((group) => withKey('reminder', group))
        .filter((group) => !alreadySent.has(group.key))
    : [];

  const dueReveals = groups
    .filter(({ lockAt }) => time >= lockAt.getTime() && time < lockAt.getTime() + REVEAL_GRACE_MS)
    .map((group) => withKey('reveal', group))
    .filter((group) => !alreadySent.has(group.key));

  return { reminders: dueReminders, reveals: dueReveals };
}

export function notificationKeys(matches: readonly NotifiableMatch[]): string[] {
  return groupByLock(matches).flatMap((group) => [
    withKey('reminder', group).key,
    withKey('reveal', group).key,
  ]);
}

function groupByLock(matches: readonly NotifiableMatch[]): Omit<LockGroup, 'key'>[] {
  const groups = new Map<string, { weekId: WeekId; lockAt: Date; matchIds: MatchId[] }>();
  for (const match of matches) {
    const id = `${match.weekId}:${match.lockAt.getTime()}`;
    const group = groups.get(id) ?? { weekId: match.weekId, lockAt: match.lockAt, matchIds: [] };
    group.matchIds.push(match.id);
    groups.set(id, group);
  }
  return [...groups.values()].toSorted((a, b) => a.lockAt.getTime() - b.lockAt.getTime());
}

function withKey(kind: 'reminder' | 'reveal', group: Omit<LockGroup, 'key'>): LockGroup {
  return { ...group, key: `${kind}:${group.weekId}:${group.lockAt.getTime()}` };
}
