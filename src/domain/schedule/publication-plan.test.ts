import { describe, expect, it } from 'vitest';
import {
  dayKeyOf,
  planPublications,
  type PlannableMatch,
  type PlannableWeek,
  type PublishedScope,
} from './publication-plan.js';
import { DEFAULT_PUBLISH_SCHEDULE } from './publish-schedule.js';

const PARIS = 'Europe/Paris';
// Tuesday 2026-10-20 10:00 Paris: the weekly slot.
const SLOT = new Date('2026-10-20T08:00:00Z');
const HOUR = 3_600_000;

let nextId = 1;
const match = (overrides: Partial<PlannableMatch> = {}): PlannableMatch => ({
  id: nextId++,
  matchDay: 1,
  scheduledAt: new Date('2026-10-23T16:00:00Z'),
  opponentsKnown: true,
  open: true,
  ...overrides,
});
const week = (id: number, matches: PlannableMatch[]): PlannableWeek => {
  const times = matches.map((m) => m.scheduledAt.getTime());
  return {
    id,
    competitionId: 'worlds',
    name: `Round ${id}`,
    startsAt: new Date(Math.min(...times)),
    endsAt: new Date(Math.max(...times)),
    matches,
  };
};
const plan = (weeks: PlannableWeek[], published: PublishedScope[] = [], now = SLOT) =>
  planPublications(weeks, published, DEFAULT_PUBLISH_SCHEDULE, PARIS, now);

describe('dayKeyOf', () => {
  it('uses the provider match day, or the local date', () => {
    expect(dayKeyOf({ matchDay: 2, scheduledAt: SLOT }, PARIS)).toBe('day:2');
    expect(dayKeyOf({ matchDay: null, scheduledAt: new Date('2026-10-20T23:30:00Z') }, PARIS)).toBe(
      'date:2026-10-21',
    );
  });
});

describe('planPublications', () => {
  it('announces fully known weeks whole, together, as before', () => {
    const lec = week(1, [match(), match({ matchDay: 2, scheduledAt: new Date('2026-10-24T16:00:00Z') })]);
    const worlds = week(2, [match({ scheduledAt: new Date('2026-10-22T16:00:00Z') })]);
    const result = plan([lec, worlds]);
    expect(result.weeks.map((w) => w.id)).toEqual([2, 1]);
    expect(result.days).toEqual([]);
    expect(result.weeks[0]).not.toHaveProperty('matches');
  });

  it('goes day by day when matchups are still undecided, each day once it is known', () => {
    // Swiss round: day 1 known, day 2 depends on day 1.
    const day1 = [match({ scheduledAt: new Date('2026-10-23T16:00:00Z') })];
    const day2 = [
      match({ matchDay: 2, scheduledAt: new Date('2026-10-24T16:00:00Z'), opponentsKnown: false }),
      match({ matchDay: 2, scheduledAt: new Date('2026-10-24T17:00:00Z'), opponentsKnown: false }),
    ];
    const round = week(3, [...day1, ...day2]);
    const first = plan([round]);
    expect(first.weeks).toEqual([]);
    expect(first.days.map((d) => [d.day, d.matchIds, d.startsAt])).toEqual([
      ['day:1', [day1[0]?.id], new Date('2026-10-23T16:00:00Z')],
    ]);

    // Day 2 decided late on day 1: announced right away.
    const known = week(3, [...day1, ...day2.map((m) => ({ ...m, opponentsKnown: true }))]);
    const later = new Date('2026-10-23T22:00:00Z');
    expect(plan([known], [{ weekId: 3, day: 'day:1' }], later).days.map((d) => d.day)).toEqual(['day:2']);
    // A week already announced by day stays by day even once fully known.
    expect(plan([known], [{ weekId: 3, day: 'day:1' }], later).weeks).toEqual([]);
  });

  it('announces a partly undecided day 24 h before its first match, with what is known', () => {
    const day = [
      match({ scheduledAt: new Date('2026-10-24T16:00:00Z') }),
      match({ scheduledAt: new Date('2026-10-24T19:00:00Z'), opponentsKnown: false }),
    ];
    const round = week(4, day);
    expect(plan([round]).days).toEqual([]);
    const dayBefore = new Date(new Date('2026-10-24T16:00:00Z').getTime() - 24 * HOUR);
    expect(plan([round], [], dayBefore).days.map((d) => d.matchIds)).toEqual([day.map((m) => m.id)]);
  });

  it('skips days with nothing left to vote on', () => {
    const allUnknown = week(5, [
      match({ opponentsKnown: false, scheduledAt: new Date('2026-10-21T16:00:00Z') }),
    ]);
    const closed = week(6, [
      match({ open: false, scheduledAt: new Date('2026-10-21T16:00:00Z') }),
      match({ matchDay: 2, opponentsKnown: false, scheduledAt: new Date('2026-10-25T16:00:00Z') }),
    ]);
    const now = new Date('2026-10-21T10:00:00Z');
    expect(plan([allUnknown, closed], [], now)).toEqual({ weeks: [], days: [] });
  });

  it('catches up an ongoing week for a server configured mid-week', () => {
    const ongoing = week(10, [
      match({ scheduledAt: new Date('2026-10-20T16:00:00Z'), open: false }),
      match({ matchDay: 2, scheduledAt: new Date('2026-10-22T16:00:00Z') }),
    ]);
    const midWeek = new Date('2026-10-21T12:00:00Z');
    expect(plan([ongoing], [], midWeek).weeks.map((w) => w.id)).toEqual([10]);
  });

  it('never repeats what was announced and ignores weeks outside the window', () => {
    const known = week(7, [match()]);
    expect(plan([known], [{ weekId: 7, day: null }])).toEqual({ weeks: [], days: [] });
    const nextWeek = week(8, [match({ scheduledAt: new Date('2026-10-28T16:00:00Z') })]);
    const over = week(9, [match({ scheduledAt: new Date('2026-10-19T16:00:00Z') })]);
    expect(plan([nextWeek, over])).toEqual({ weeks: [], days: [] });
  });
});
