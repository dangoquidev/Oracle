import { describe, expect, it } from 'vitest';
import type { PredictionWeek } from './prediction-week.js';
import { pickWeek } from './week-navigation.js';

const week = (id: number, start: string, end: string): PredictionWeek => ({
  id,
  competitionId: 'lec',
  name: `Week ${id}`,
  startsAt: new Date(start),
  endsAt: new Date(end),
});

const weeks = [
  week(2, '2026-08-07T16:00:00Z', '2026-08-10T18:00:00Z'),
  week(1, '2026-07-31T16:00:00Z', '2026-08-03T18:00:00Z'),
  week(3, '2026-08-14T16:00:00Z', '2026-08-17T18:00:00Z'),
];

describe('pickWeek', () => {
  it('picks the week being played', () => {
    expect(pickWeek(weeks, new Date('2026-08-08T12:00:00Z'), 0)?.id).toBe(2);
  });

  it('picks the next week between two weeks', () => {
    expect(pickWeek(weeks, new Date('2026-08-05T12:00:00Z'), 0)?.id).toBe(2);
  });

  it('moves backward and forward', () => {
    const now = new Date('2026-08-08T12:00:00Z');
    expect(pickWeek(weeks, now, -1)?.id).toBe(1);
    expect(pickWeek(weeks, now, 1)?.id).toBe(3);
  });

  it('falls back to the last week once the season is over', () => {
    expect(pickWeek(weeks, new Date('2026-09-01T00:00:00Z'), 0)?.id).toBe(3);
    expect(pickWeek(weeks, new Date('2026-09-01T00:00:00Z'), 1)).toBeNull();
  });

  it('handles the first week and an empty calendar', () => {
    expect(pickWeek(weeks, new Date('2026-07-01T00:00:00Z'), -1)).toBeNull();
    expect(pickWeek([], new Date(), 0)).toBeNull();
  });
});
