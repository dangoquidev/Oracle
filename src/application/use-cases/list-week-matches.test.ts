import { beforeEach, describe, expect, it } from 'vitest';
import type { Competition } from '../../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../../domain/competition/scoring.js';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryLockOverrideRepository,
  InMemoryPredictionRepository,
  InMemoryResultOverrideRepository,
} from '../../test-support/fakes.js';
import { ListWeekMatches } from './list-week-matches.js';
import { LockCalculatorFactory } from './lock-calculator.js';

const competitions: Competition[] = [
  { id: 'worlds', name: 'Worlds', source: { league: 'W' }, scoring: DEFAULT_SCORING },
  { id: 'lec', name: 'LEC', source: { league: 'L' }, scoring: DEFAULT_SCORING },
];

describe('ListWeekMatches', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let predictions: InMemoryPredictionRepository;
  let clock: FixedClock;
  let resultOverrides: InMemoryResultOverrideRepository;
  let list: ListWeekMatches;

  const week1 = week({
    id: 1,
    name: 'Week 1',
    startsAt: new Date('2026-07-25T16:00:00Z'),
    endsAt: new Date('2026-07-25T16:00:00Z'),
  });
  const week2 = week({
    id: 2,
    name: 'Week 2',
    startsAt: new Date('2026-08-01T16:00:00Z'),
    endsAt: new Date('2026-08-01T19:00:00Z'),
  });
  const past = match({
    id: 1,
    weekId: 1,
    scheduledAt: week1.startsAt,
    status: 'completed',
    result: { winner: 1, score: null },
  });
  const early = match({ id: 2, weekId: 2, scheduledAt: new Date('2026-08-01T16:00:00Z') });
  const late = match({ id: 3, weekId: 2, matchDay: 2, scheduledAt: new Date('2026-08-01T19:00:00Z') });

  beforeEach(() => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1', { competitionIds: ['lec', 'worlds'] }));
    calendar = new InMemoryCalendarRepository();
    calendar.weeks.push(week1, week2);
    calendar.matches.push(past, early, late);
    calendar.views.push(weekView(week1, [past]), weekView(week2, [early, late]));
    predictions = new InMemoryPredictionRepository();
    clock = new FixedClock(new Date('2026-08-01T15:00:00Z'));
    const locks = new LockCalculatorFactory(calendar, new InMemoryLockOverrideRepository());
    resultOverrides = new InMemoryResultOverrideRepository();
    list = new ListWeekMatches(guilds, calendar, predictions, resultOverrides, locks, competitions, clock);
  });

  it('shows the current week with each match state, revealing votes only once locked', async () => {
    await predictions.save({
      guildId: 'g1',
      userId: 'u',
      matchId: 2,
      choice: { kind: 'winner', winner: 2 },
      submittedAt: new Date(),
    });
    await predictions.save({
      guildId: 'g1',
      userId: 'u',
      matchId: 3,
      choice: { kind: 'winner', winner: 1 },
      submittedAt: new Date(),
    });

    const result = await list.execute('g1', 0, null);

    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({ locale: 'fr', timeZone: 'Europe/Paris' });
    const [current] = result.value.weeks;
    expect(current?.week.week.name).toBe('Week 2');
    expect(
      current?.items.map((item) => [item.match.id, item.state, item.distribution?.team2Percent ?? null]),
    ).toEqual([
      [2, 'locked', 100],
      [3, 'open', null],
    ]);
  });

  it('shows admin corrections and cancellations', async () => {
    await resultOverrides.set('g1', 3, { kind: 'cancelled' });
    await resultOverrides.set('g1', 2, { kind: 'result', result: { winner: 2, score: null } });
    const result = await list.execute('g1', 0, 'lec');
    expect(result.ok && result.value.weeks[0]?.items.map((item) => [item.state, item.outcome.kind])).toEqual([
      ['closed', 'decided'],
      ['cancelled', 'void'],
    ]);
  });

  it('navigates to the previous week', async () => {
    const result = await list.execute('g1', -1, 'lec');
    expect(result.ok && result.value.weeks.map((w) => [w.week.week.name, w.items[0]?.state])).toEqual([
      ['Week 1', 'closed'],
    ]);
  });

  it('skips competitions without a week at that offset', async () => {
    const result = await list.execute('g1', 1, null);
    expect(result.ok && result.value.weeks).toEqual([]);
  });

  it('refuses disabled competitions and inactive servers', async () => {
    guilds.add(activeGuild('g2', { competitionIds: ['lec'] }));
    expect(await list.execute('g2', 0, 'worlds')).toEqual({ ok: false, error: 'competition-not-enabled' });
    expect(await list.execute('nope', 0, null)).toEqual({ ok: false, error: 'guild-not-active' });
  });

  it('ignores weeks whose details are missing', async () => {
    calendar.views.length = 0;
    const result = await list.execute('g1', 0, 'lec');
    expect(result.ok && result.value.weeks).toEqual([]);
  });
});
