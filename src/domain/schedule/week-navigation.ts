import type { PredictionWeek } from './prediction-week.js';

export type WeekOffset = -1 | 0 | 1;

/**
 * The current week of a competition is the one being played, or else the next one to come
 * (or the last one played when the season is over). Offsets move from there.
 */
export function pickWeek(
  weeks: readonly PredictionWeek[],
  now: Date,
  offset: WeekOffset,
): PredictionWeek | null {
  const ordered = weeks.toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (ordered.length === 0) return null;

  const time = now.getTime();
  let current = ordered.findIndex((week) => week.endsAt.getTime() >= time);
  if (current === -1) current = ordered.length - 1;
  return ordered[current + offset] ?? null;
}

/** The week being played or the last one played: the one whose points are being earned. */
export function latestStartedWeek(weeks: readonly PredictionWeek[], now: Date): PredictionWeek | null {
  const started = weeks.filter((week) => week.startsAt.getTime() <= now.getTime());
  return started.toSorted((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0] ?? null;
}
