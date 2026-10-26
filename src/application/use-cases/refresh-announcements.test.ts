import { beforeEach, describe, expect, it } from 'vitest';
import { activeGuild, match, team, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryPublicationRepository,
  RecordingMessenger,
  SilentLogger,
} from '../../test-support/fakes.js';
import { announcementFingerprint } from '../read-models/fingerprint.js';
import { RefreshAnnouncements } from './refresh-announcements.js';

describe('RefreshAnnouncements', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let publications: InMemoryPublicationRepository;
  let messenger: RecordingMessenger;
  let logger: SilentLogger;
  let refresh: RefreshAnnouncements;
  const week1 = week({ id: 1 });
  const tbdMatch = match({ id: 1, team2Id: null });

  beforeEach(async () => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
    calendar = new InMemoryCalendarRepository();
    calendar.views.push(weekView(week1, [tbdMatch]));
    publications = new InMemoryPublicationRepository();
    const id = await publications.reserve('g1', [1], 'channel-1', new Date());
    await publications.attachMessage(id ?? 0, 'msg-1', announcementFingerprint(calendar.views));
    messenger = new RecordingMessenger();
    logger = new SilentLogger();
    refresh = new RefreshAnnouncements(
      guilds,
      publications,
      calendar,
      messenger,
      new FixedClock(new Date()),
      logger,
    );
  });

  it('leaves unchanged announcements alone', async () => {
    expect(await refresh.executeForAll()).toBe(0);
    expect(messenger.updates).toEqual([]);
  });

  it('edits the message once opponents are known, then stops', async () => {
    calendar.views.splice(0, 1, {
      ...weekView(week1, [tbdMatch]),
      matches: [{ ...weekView(week1, [tbdMatch]).matches[0], team2: team(20, 'FNC') } as never],
    });

    expect(await refresh.executeForAll()).toBe(1);
    expect(
      messenger.updates.map((u) => [u.messageId, u.announcement.channelId, u.announcement.publicationId]),
    ).toEqual([['msg-1', 'channel-1', 1]]);
    expect(await refresh.executeForAll()).toBe(0);
  });

  it('keeps a day announcement to its own day', async () => {
    const other = match({ id: 2, matchDay: 2, scheduledAt: new Date('2026-08-02T16:00:00Z') });
    calendar.views.splice(0, 1, weekView(week1, [{ ...tbdMatch, team2Id: 20 }, other]));
    publications.publications.clear();
    const id = await publications.reserve('g1', [1], 'channel-1', new Date(), 'day:1');
    await publications.attachMessage(id ?? 0, 'msg-2', 'old');

    expect(await refresh.executeForAll()).toBe(1);
    expect(messenger.updates[0]?.announcement.scope).toBe('day');
    expect(messenger.updates[0]?.announcement.weeks[0]?.matches.map((m) => m.id)).toEqual([1]);
  });

  it('stops trying when the message was deleted', async () => {
    calendar.views.splice(0, 1, weekView(week({ id: 1, name: 'Renamed' }), [tbdMatch]));
    messenger.deletedMessages.add('msg-1');
    expect(await refresh.executeForAll()).toBe(0);
    expect(publications.publications.get(1)?.fingerprint).toBe(announcementFingerprint(calendar.views));
  });

  it('skips reservations without a message and logs failures', async () => {
    await publications.reserve('g1', [2], 'channel-1', new Date());
    calendar.views.push(weekView(week({ id: 2 }), []));
    calendar.views.splice(0, 1, weekView(week({ id: 1, name: 'Renamed' }), [tbdMatch]));
    messenger.failWith = new Error('boom');
    expect(await refresh.executeForAll()).toBe(0);
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });
});
