import { beforeEach, describe, expect, it } from 'vitest';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryLockOverrideRepository,
  InMemoryPublicationRepository,
  RecordingMessenger,
  SilentLogger,
} from '../../test-support/fakes.js';
import { LockCalculatorFactory } from './lock-calculator.js';
import { PublishDueWeeks } from './publish-due-weeks.js';

// Tuesday 2026-07-21, 10:00 Paris = publication slot by default.
const SLOT = new Date('2026-07-21T08:00:00Z');

describe('PublishDueWeeks', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let publications: InMemoryPublicationRepository;
  let messenger: RecordingMessenger;
  let clock: FixedClock;
  let logger: SilentLogger;
  let publish: PublishDueWeeks;

  const week1 = week({
    id: 1,
    startsAt: new Date('2026-07-24T16:00:00Z'),
    endsAt: new Date('2026-07-26T18:00:00Z'),
  });
  const week2 = week({
    id: 2,
    startsAt: new Date('2026-07-31T16:00:00Z'),
    endsAt: new Date('2026-08-03T18:00:00Z'),
  });
  const worldsWeek = week({ id: 3, competitionId: 'worlds', startsAt: week1.startsAt, endsAt: week1.endsAt });

  beforeEach(() => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1', { competitionIds: ['lec'] }));
    calendar = new InMemoryCalendarRepository();
    calendar.weeks.push(week1, week2, worldsWeek);
    calendar.views.push(weekView(week1, [match({ weekId: 1 })]), weekView(week2, []));
    publications = new InMemoryPublicationRepository();
    messenger = new RecordingMessenger();
    clock = new FixedClock(SLOT);
    logger = new SilentLogger();
    publish = new PublishDueWeeks(
      guilds,
      calendar,
      publications,
      new LockCalculatorFactory(calendar, new InMemoryLockOverrideRepository()),
      messenger,
      clock,
      logger,
    );
  });

  it('announces the upcoming week of enabled competitions in the configured channel', async () => {
    expect(await publish.execute('g1')).toEqual([1]);
    expect(messenger.announcements).toHaveLength(1);
    expect(messenger.announcements[0]).toMatchObject({
      guildId: 'g1',
      channelId: 'channel-1',
      pingRoleId: 'role-1',
      locale: 'fr',
      timeZone: 'Europe/Paris',
      publicationId: 1,
    });
    expect(messenger.announcements[0]?.weeks.map((w) => w.week.id)).toEqual([1]);
    expect(publications.publications.get(1)?.messageId).toBe('message-1');
  });

  it('announces each week only once', async () => {
    await publish.execute('g1');
    clock.set(new Date(SLOT.getTime() + 60_000));
    expect(await publish.execute('g1')).toEqual([]);
    expect(messenger.announcements).toHaveLength(1);
  });

  it('stays silent on servers that are not active', async () => {
    guilds.add({ ...activeGuild('g2'), status: 'paused' });
    expect(await publish.execute('g2')).toEqual([]);
    expect(await publish.execute('unknown')).toEqual([]);
    expect(messenger.announcements).toEqual([]);
  });

  it('releases the reservation when the announcement fails, so it is retried', async () => {
    messenger.failWith = new Error('discord down');
    await expect(publish.execute('g1')).rejects.toThrow('discord down');
    expect(publications.publications.size).toBe(0);

    messenger.failWith = null;
    expect(await publish.execute('g1')).toEqual([1]);
  });

  it('gives up quietly when another process claimed the weeks first', async () => {
    await publications.reserve('g1', [1], 'channel-1', SLOT);
    const findPublished = publications.findPublishedScopes.bind(publications);
    publications.findPublishedScopes = () => Promise.resolve([]);
    expect(await publish.execute('g1')).toEqual([]);
    publications.findPublishedScopes = findPublished;
    expect(messenger.announcements).toEqual([]);
  });

  describe('weeks whose matchups are decided as they go', () => {
    // Swiss round over two days: day 2 depends on day 1 results.
    const round = week({
      id: 4,
      competitionId: 'worlds',
      name: 'Round 3',
      startsAt: new Date('2026-07-24T16:00:00Z'),
      endsAt: new Date('2026-07-25T17:00:00Z'),
    });
    const day1 = match({
      id: 41,
      weekId: 4,
      competitionId: 'worlds',
      matchDay: 1,
      scheduledAt: round.startsAt,
    });
    const day2 = (team1Id: number | null) =>
      match({
        id: 42,
        weekId: 4,
        competitionId: 'worlds',
        matchDay: 2,
        team1Id,
        scheduledAt: new Date('2026-07-25T16:00:00Z'),
      });
    const day2b = match({
      id: 43,
      weekId: 4,
      competitionId: 'worlds',
      matchDay: 2,
      team1Id: null,
      team2Id: null,
      scheduledAt: round.endsAt,
    });

    beforeEach(() => {
      guilds.add(activeGuild('g1', { competitionIds: ['worlds'] }));
      calendar.weeks.push(round);
      calendar.views.splice(0, calendar.views.length, weekView(round, [day1, day2(null), day2b], 'Worlds'));
    });

    it('announces each day on its own, as soon as its matchups are known', async () => {
      expect(await publish.execute('g1')).toEqual([4]);
      expect(messenger.announcements).toHaveLength(1);
      expect(messenger.announcements[0]).toMatchObject({ scope: 'day', publicationId: 1 });
      expect(messenger.announcements[0]?.weeks[0]?.matches.map((m) => m.id)).toEqual([41]);
      expect(publications.publications.get(1)?.day).toBe('day:1');

      // Nothing more until day 2 is decided…
      clock.set(new Date('2026-07-24T20:00:00Z'));
      expect(await publish.execute('g1')).toEqual([]);

      // …then it goes out right away, with the role pinged again.
      const decided = { ...day2b, team1Id: 30, team2Id: 40 };
      calendar.views.splice(0, 1, weekView(round, [day1, day2(10), decided], 'Worlds'));
      expect(await publish.execute('g1')).toEqual([4]);
      expect(messenger.announcements[1]?.weeks[0]?.matches.map((m) => m.id)).toEqual([42, 43]);
      expect(await publish.execute('g1')).toEqual([]);
    });

    it('announces a still partly undecided day 24 h before it starts', async () => {
      await publish.execute('g1');
      calendar.views.splice(0, 1, weekView(round, [day1, day2(10), day2b], 'Worlds'));
      clock.set(new Date('2026-07-24T15:00:00Z'));
      expect(await publish.execute('g1')).toEqual([]);
      clock.set(new Date('2026-07-24T16:00:00Z'));
      expect(await publish.execute('g1')).toEqual([4]);
      expect(messenger.announcements[1]?.weeks[0]?.matches.map((m) => m.id)).toEqual([42, 43]);
    });
  });

  it('runs for every active server and isolates failures', async () => {
    guilds.add(activeGuild('g2', { competitionIds: ['worlds'] }));
    calendar.views.push(weekView(worldsWeek, [], 'Worlds'));
    const announce = messenger.announceWeeks.bind(messenger);
    messenger.announceWeeks = (announcement) =>
      announcement.guildId === 'g1' ? Promise.reject(new Error('boom')) : announce(announcement);

    await publish.executeForAll();

    expect(messenger.announcements.map((a) => a.guildId)).toEqual(['g2']);
    expect(logger.entries.some((entry) => entry.level === 'error')).toBe(true);
  });
});
