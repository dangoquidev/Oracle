import { beforeEach, describe, expect, it } from 'vitest';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryLockOverrideRepository,
} from '../../test-support/fakes.js';
import { ListLockTargets } from './list-lock-targets.js';
import { SetLockOverride } from './set-lock-override.js';

const upcoming = match({ id: 1, scheduledAt: new Date('2026-08-01T16:00:00Z') });
const later = match({ id: 2, scheduledAt: new Date('2026-08-01T19:00:00Z') });
const played = match({
  id: 3,
  scheduledAt: new Date('2026-07-31T16:00:00Z'),
  status: 'completed',
  result: { winner: 1, score: null },
});

describe('lock overrides', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let overrides: InMemoryLockOverrideRepository;
  let clock: FixedClock;
  let setOverride: SetLockOverride;

  beforeEach(() => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
    calendar = new InMemoryCalendarRepository();
    const week1 = week({ id: 1, name: 'Week 1', startsAt: played.scheduledAt, endsAt: later.scheduledAt });
    calendar.weeks.push(week1);
    calendar.matches.push(upcoming, later, played);
    calendar.views.push(weekView(week1, [played, upcoming, later]));
    overrides = new InMemoryLockOverrideRepository();
    clock = new FixedClock(new Date('2026-08-01T15:00:00Z'));
    setOverride = new SetLockOverride(guilds, calendar, overrides, clock);
  });

  describe('SetLockOverride', () => {
    it('opens every upcoming match of a week', async () => {
      const result = await setOverride.execute({
        guildId: 'g1',
        adminId: 'admin',
        target: { kind: 'week', weekId: 1 },
        state: 'open',
      });

      expect(result.ok && result.value.matches.map((m) => m.id)).toEqual([1, 2]);
      expect(result.ok && [result.value.competitionName, result.value.weekName]).toEqual(['LEC', 'Week 1']);
      expect(overrides.overrides.get('g1:1')).toEqual({ state: 'open', at: clock.now(), setBy: 'admin' });
      expect(overrides.overrides.has('g1:3')).toBe(false);
    });

    it('closes a single match', async () => {
      const result = await setOverride.execute({
        guildId: 'g1',
        adminId: 'admin',
        target: { kind: 'match', matchId: 2 },
        state: 'closed',
      });
      expect(result.ok && result.value.matches.map((m) => m.id)).toEqual([2]);
      expect([...overrides.overrides.keys()]).toEqual(['g1:2']);
    });

    it('refuses unknown targets, played matches and inactive servers', async () => {
      const command = { guildId: 'g1', adminId: 'a', state: 'open' } as const;
      expect(await setOverride.execute({ ...command, target: { kind: 'week', weekId: 9 } })).toEqual({
        ok: false,
        error: 'target-not-found',
      });
      expect(await setOverride.execute({ ...command, target: { kind: 'match', matchId: 9 } })).toEqual({
        ok: false,
        error: 'target-not-found',
      });
      expect(await setOverride.execute({ ...command, target: { kind: 'match', matchId: 3 } })).toEqual({
        ok: false,
        error: 'no-open-match',
      });
      expect(
        await setOverride.execute({ ...command, guildId: 'nope', target: { kind: 'week', weekId: 1 } }),
      ).toEqual({ ok: false, error: 'guild-not-active' });
    });
  });

  describe('ListLockTargets', () => {
    it('lists upcoming matches of enabled competitions', async () => {
      const targets = await new ListLockTargets(guilds, calendar, clock).execute('g1');
      expect(targets.timeZone).toBe('Europe/Paris');
      expect(targets.weeks.map((t) => [t.week.name, t.matches.map((m) => m.id)])).toEqual([
        ['Week 1', [1, 2]],
      ]);
    });

    it('lists recently played matches for result corrections', async () => {
      const targets = await new ListLockTargets(guilds, calendar, clock).execute('g1', 'recent');
      expect(targets.weeks.map((t) => t.matches.map((m) => m.id))).toEqual([[3]]);
    });

    it('drops weeks without upcoming matches and inactive servers', async () => {
      clock.set(new Date('2026-08-01T20:00:00Z'));
      expect((await new ListLockTargets(guilds, calendar, clock).execute('g1')).weeks).toEqual([]);
      expect(await new ListLockTargets(guilds, calendar, clock).execute('nope')).toEqual({
        timeZone: 'UTC',
        weeks: [],
      });
    });
  });
});
