import type { RecapFrequency } from '../guild/guild-settings.js';
import type { MatchId, WeekId } from '../shared/ids.js';
import { localDateOf } from '../shared/time-zone.js';

export interface RecapMatch {
  readonly id: MatchId;
  readonly weekId: WeekId;
  readonly matchDay: number | null;
  readonly scheduledAt: Date;
  /** Decided or cancelled on this server: nothing left to wait for. */
  readonly resolved: boolean;
}

/** Matches summed up by one recap: a match day or a whole week. */
export interface RecapGroup {
  readonly key: string;
  readonly kind: 'day' | 'week';
  readonly weekId: WeekId;
  readonly matchIds: readonly MatchId[];
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/** Recaps are posted once results are in, not days later after downtime or a late correction. */
export const RECAP_WINDOW_MS = 3 * 86_400_000;

/**
 * Days (daily frequency) or weeks (weekly frequency) whose matches are all resolved, recently enough
 * to be worth a recap. A "day" is the provider's match day, or the local date when unknown.
 */
export function completedRecapGroups(
  matches: readonly RecapMatch[],
  frequency: RecapFrequency,
  timeZone: string,
  now: Date,
): RecapGroup[] {
  const kind = frequency === 'daily' ? 'day' : 'week';
  const groups = new Map<string, { weekId: WeekId; members: RecapMatch[] }>();
  for (const match of matches) {
    const key =
      kind === 'week'
        ? `recap:week:${match.weekId}`
        : `recap:day:${match.weekId}:${match.matchDay ?? localDateOf(match.scheduledAt, timeZone)}`;
    const group = groups.get(key) ?? { weekId: match.weekId, members: [] };
    group.members.push(match);
    groups.set(key, group);
  }

  const time = now.getTime();
  const due: RecapGroup[] = [];
  for (const [key, { weekId, members }] of groups) {
    if (!members.every((match) => match.resolved)) continue;
    const ordered = members.toSorted((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const startsAt = ordered[0]?.scheduledAt;
    const endsAt = ordered.at(-1)?.scheduledAt;
    if (!startsAt || !endsAt) continue;
    if (endsAt.getTime() > time || time - endsAt.getTime() > RECAP_WINDOW_MS) continue;
    due.push({ key, kind, weekId, matchIds: ordered.map((match) => match.id), startsAt, endsAt });
  }
  return due.toSorted((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
}

export const seasonRecapKey = (seasonId: number): string => `recap:season:${seasonId}`;
