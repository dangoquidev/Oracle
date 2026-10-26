import type { MatchId, WeekId } from '../shared/ids.js';
import { localDateOf } from '../shared/time-zone.js';
import { nextSlot, type PublishSchedule } from './publish-schedule.js';
import type { PredictionWeek } from './prediction-week.js';

/** Identifies a day of a week: the provider's match day, or the local date when it has none. */
export type DayKey = string;

export function dayKeyOf(
  match: { readonly matchDay: number | null; readonly scheduledAt: Date },
  timeZone: string,
): DayKey {
  return match.matchDay === null
    ? `date:${localDateOf(match.scheduledAt, timeZone)}`
    : `day:${match.matchDay}`;
}

export interface PlannableMatch {
  readonly id: MatchId;
  readonly matchDay: number | null;
  readonly scheduledAt: Date;
  readonly opponentsKnown: boolean;
  /** Votes still open on it (lock not passed, not played or cancelled). */
  readonly open: boolean;
}

export interface PlannableWeek extends PredictionWeek {
  readonly matches: readonly PlannableMatch[];
}

/** What a server already announced: whole weeks, or single days of a week. */
export interface PublishedScope {
  readonly weekId: WeekId;
  /** Null for a whole week. */
  readonly day: DayKey | null;
}

export interface DayPublication {
  readonly week: PredictionWeek;
  readonly day: DayKey;
  readonly matchIds: readonly MatchId[];
  /** Scheduled time of the day's first match. */
  readonly startsAt: Date;
}

export interface PublicationPlan {
  /** Fully known weeks, announced together in one message. */
  readonly weeks: readonly PredictionWeek[];
  /** Days of weeks whose matchups are not all known yet, one message each. */
  readonly days: readonly DayPublication[];
}

/** A day still partly undecided is announced anyway this long before its first match. */
export const PARTIAL_DAY_NOTICE_MS = 24 * 3_600_000;

/**
 * What to announce now. A week whose matchups are all known when it comes due is announced whole,
 * as usual. Otherwise (Swiss rounds, playoffs decided as they go), it is announced day by day:
 * each day as soon as its matchups are all known, or 24 h before its first match with what is known.
 */
export function planPublications(
  weeks: readonly PlannableWeek[],
  published: readonly PublishedScope[],
  schedule: PublishSchedule,
  timeZone: string,
  now: Date,
): PublicationPlan {
  const upcomingSlot = nextSlot(schedule, timeZone, now).getTime();
  const time = now.getTime();
  const due = weeks
    .filter((week) => week.endsAt.getTime() > time && week.startsAt.getTime() < upcomingSlot)
    .toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const wholeWeeks: PredictionWeek[] = [];
  const days: DayPublication[] = [];
  for (const week of due) {
    const scopes = published.filter((scope) => scope.weekId === week.id);
    if (scopes.some((scope) => scope.day === null)) continue;
    if (scopes.length === 0 && week.matches.every((match) => match.opponentsKnown)) {
      wholeWeeks.push(stripMatches(week));
      continue;
    }
    const publishedDays = new Set(scopes.map((scope) => scope.day));
    for (const [day, matches] of Map.groupBy(week.matches, (match) => dayKeyOf(match, timeZone))) {
      if (publishedDays.has(day) || !isDayDue(matches, time)) continue;
      days.push({
        week: stripMatches(week),
        day,
        matchIds: matches.map((match) => match.id),
        startsAt: new Date(firstStartOf(matches)),
      });
    }
  }
  return { weeks: wholeWeeks, days: days.toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) };
}

function isDayDue(matches: readonly PlannableMatch[], time: number): boolean {
  if (!matches.some((match) => match.open && match.opponentsKnown)) return false;
  if (matches.every((match) => match.opponentsKnown)) return true;
  return firstStartOf(matches) - time <= PARTIAL_DAY_NOTICE_MS;
}

function firstStartOf(matches: readonly PlannableMatch[]): number {
  return Math.min(...matches.map((match) => match.scheduledAt.getTime()));
}

function stripMatches({ matches: _matches, ...week }: PlannableWeek): PredictionWeek {
  return week;
}
