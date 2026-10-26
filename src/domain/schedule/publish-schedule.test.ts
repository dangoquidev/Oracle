import { describe, expect, it } from 'vitest';
import { nextSlot, previousSlot, type PublishSchedule } from './publish-schedule.js';

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
