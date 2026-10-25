import { beforeEach, describe, expect, it } from 'vitest';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryPublicationRepository,
  RecordingMessenger,
  SilentLogger,
} from '../../test-support/fakes.js';
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
    publish = new PublishDueWeeks(guilds, calendar, publications, messenger, clock, logger);
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
    const findPublished = publications.findPublishedWeekIds.bind(publications);
    publications.findPublishedWeekIds = () => Promise.resolve(new Set<number>());
    expect(await publish.execute('g1')).toEqual([]);
    publications.findPublishedWeekIds = findPublished;
    expect(messenger.announcements).toEqual([]);
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
