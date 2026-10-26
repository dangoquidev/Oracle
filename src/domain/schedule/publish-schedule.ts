import { DateTime } from 'luxon';

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PublishSchedule {
  readonly weekday: Weekday;
  readonly hour: number;
  readonly minute: number;
}

export const DEFAULT_PUBLISH_SCHEDULE: PublishSchedule = { weekday: 2, hour: 10, minute: 0 };

/** Latest publication slot at or before `now`. */
export function previousSlot(schedule: PublishSchedule, timeZone: string, now: Date): Date {
  const local = DateTime.fromJSDate(now, { zone: timeZone });
  let slot = local.set({
    weekday: schedule.weekday,
    hour: schedule.hour,
    minute: schedule.minute,
    second: 0,
    millisecond: 0,
  });
  if (slot > local) slot = slot.minus({ weeks: 1 });
  return slot.toJSDate();
}

/** Earliest publication slot strictly after `now`. */
export function nextSlot(schedule: PublishSchedule, timeZone: string, now: Date): Date {
  const previous = DateTime.fromJSDate(previousSlot(schedule, timeZone, now), { zone: timeZone });
  return previous.plus({ weeks: 1 }).toJSDate();
}
