import { dayKeyOf, type DayKey } from '../../domain/schedule/publication-plan.js';
import type { WeekView } from './views.js';

/** The matches an announcement covers: its whole weeks, or the single day it was made for. */
export function scopeWeeks(weeks: readonly WeekView[], day: DayKey | null, timeZone: string): WeekView[] {
  if (day === null) return [...weeks];
  return weeks.map((week) => ({
    ...week,
    matches: week.matches.filter((match) => dayKeyOf(match, timeZone) === day),
  }));
}
