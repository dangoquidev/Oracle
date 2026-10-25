import { describe, expect, it } from 'vitest';
import type { PredictionWeek } from './prediction-week.js';
import { nextSlot, previousSlot, weeksDueForPublication, type PublishSchedule } from './publish-schedule.js';

const tuesday10: PublishSchedule = { weekday: 2, hour: 10, minute: 0 };
const paris = 'Europe/Paris';
const at = (iso: string) => new Date(iso);

describe('publication slots', () => {
  it('finds the previous and next slot in the guild time zone', () => {
    // Wednesday 2026-10-28; Paris is UTC+1 after the DST change.
    const now = at('2026-10-28T12:00:00Z');
    expect(previousSlot(tuesday10, paris, now)).toEqual(at('2026-10-27T09:00:00Z'));
    expect(nextSlot(tuesday10, paris, now)).toEqual(at('2026-11-03T09:00:00Z'));
  });

  it('treats the exact slot instant as the current slot', () => {
    const slot = at('2026-10-27T09:00:00Z');
    expect(previousSlot(tuesday10, paris, slot)).toEqual(slot);
  });

  it('goes back one week when this week slot is still ahead', () => {
    const mondayEvening = at('2026-10-26T18:00:00Z');
    expect(previousSlot(tuesday10, paris, mondayEvening)).toEqual(at('2026-10-20T08:00:00Z'));
  });
});

describe('weeksDueForPublication', () => {
  const week = (id: number, start: string, end: string): PredictionWeek => ({
    id,
    competitionId: 'worlds',
    name: `Round ${id}`,
    startsAt: at(start),
    endsAt: at(end),
  });
  const round3 = week(3, '2026-10-25T15:00:00Z', '2026-10-26T20:00:00Z');
  const round4 = week(4, '2026-10-28T15:00:00Z', '2026-10-30T20:00:00Z');
  const round5 = week(5, '2026-10-31T15:00:00Z', '2026-10-31T20:00:00Z');
  const quarters = week(6, '2026-11-03T15:00:00Z', '2026-11-06T20:00:00Z');
  const all = [quarters, round5, round4, round3];

  it('publishes every week starting before the next slot, in order', () => {
    const due = weeksDueForPublication(all, tuesday10, paris, at('2026-10-27T09:00:00Z'), new Set());
    expect(due.map((w) => w.id)).toEqual([4, 5]);
  });

  it('skips weeks already published', () => {
    const due = weeksDueForPublication(all, tuesday10, paris, at('2026-10-27T09:01:00Z'), new Set([4, 5]));
    expect(due).toEqual([]);
  });

  it('catches up an ongoing week for a guild configured mid-week', () => {
    const due = weeksDueForPublication(all, tuesday10, paris, at('2026-10-29T12:00:00Z'), new Set());
    expect(due.map((w) => w.id)).toEqual([4, 5]);
  });

  it('ignores finished weeks', () => {
    const due = weeksDueForPublication([round3], tuesday10, paris, at('2026-10-27T09:00:00Z'), new Set());
    expect(due).toEqual([]);
  });
});
