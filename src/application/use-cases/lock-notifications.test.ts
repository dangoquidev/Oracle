import { beforeEach, describe, expect, it } from 'vitest';
import { activeGuild, match, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  InMemoryDispatchLog,
  InMemoryGuildRepository,
  InMemoryLockOverrideRepository,
  InMemoryPredictionRepository,
  InMemoryPublicationRepository,
  RecordingMessenger,
  SilentLogger,
} from '../../test-support/fakes.js';
import { LockCalculatorFactory } from './lock-calculator.js';
import { SendLockNotifications } from './send-lock-notifications.js';

// Day 1: 16:00 and 19:00 UTC → per-day lock (2h) at 14:00; reminder (1h) from 13:00.
const early = match({ id: 1, scheduledAt: new Date('2026-08-01T16:00:00Z') });
const late = match({ id: 2, scheduledAt: new Date('2026-08-01T19:00:00Z') });
const tbd = match({ id: 3, matchDay: 2, scheduledAt: new Date('2026-08-02T16:00:00Z'), team2Id: null });

describe('SendLockNotifications', () => {
  let guilds: InMemoryGuildRepository;
  let calendar: InMemoryCalendarRepository;
  let publications: InMemoryPublicationRepository;
  let predictions: InMemoryPredictionRepository;
  let dispatchLog: InMemoryDispatchLog;
  let messenger: RecordingMessenger;
  let clock: FixedClock;
  let logger: SilentLogger;
  let notify: SendLockNotifications;

  beforeEach(async () => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
    calendar = new InMemoryCalendarRepository();
    const week1 = week({ id: 1, name: 'Week 1' });
    calendar.weeks.push(week1);
    calendar.matches.push(early, late, tbd);
    calendar.views.push(weekView(week1, [early, late, tbd]));
    publications = new InMemoryPublicationRepository();
    await publications.reserve('g1', [1], 'channel-1', new Date());
    predictions = new InMemoryPredictionRepository();
    dispatchLog = new InMemoryDispatchLog();
    messenger = new RecordingMessenger();
    clock = new FixedClock(new Date('2026-08-01T13:05:00Z'));
    logger = new SilentLogger();
    notify = new SendLockNotifications(
      guilds,
      publications,
      calendar,
      predictions,
      dispatchLog,
      new LockCalculatorFactory(calendar, new InMemoryLockOverrideRepository()),
      messenger,
      clock,
      logger,
    );
  });

  it('reminds the role once before the lock, with a link to the announcement', async () => {
    await notify.executeForAll();
    await notify.executeForAll();

    expect(messenger.reminders).toHaveLength(1);
    expect(messenger.reminders[0]).toMatchObject({
      guildId: 'g1',
      channelId: 'channel-1',
      pingRoleId: 'role-1',
      publicationId: 1,
      competitionName: 'LEC',
      weekName: 'Week 1',
      lockAt: new Date('2026-08-01T14:00:00Z'),
    });
    expect(messenger.reminders[0]?.matches.map((m) => m.id)).toEqual([1, 2]);
  });

  it('skips reminders when the server disabled them', async () => {
    guilds.add(activeGuild('g1', { reminders: { enabled: false, offsetMinutes: 60 } }));
    await notify.executeForAll();
    expect(messenger.reminders).toEqual([]);
  });

  it('reveals the vote distribution once locked', async () => {
    await predictions.save({
      guildId: 'g1',
      userId: 'u1',
      matchId: 1,
      choice: { kind: 'winner', winner: 1 },
      submittedAt: new Date(),
    });
    await predictions.save({
      guildId: 'g1',
      userId: 'u2',
      matchId: 1,
      choice: { kind: 'winner', winner: 2 },
      submittedAt: new Date(),
    });
    clock.set(new Date('2026-08-01T14:01:00Z'));

    await notify.executeForAll();
    await notify.executeForAll();

    expect(messenger.reveals).toHaveLength(1);
    expect(messenger.reveals[0]?.matches.map(({ match, distribution }) => [match.id, distribution])).toEqual([
      [1, { total: 2, team1Percent: 50, team2Percent: 50, topScore: null }],
    ]);
  });

  it('does not post a reveal nobody voted for, but marks it done', async () => {
    clock.set(new Date('2026-08-01T14:01:00Z'));
    await notify.executeForAll();
    expect(messenger.reveals).toEqual([]);
    expect(dispatchLog.sent.size).toBe(1);
  });

  it('ignores servers without announced weeks', async () => {
    publications.finished.add(1);
    await notify.executeForAll();
    expect(messenger.reminders).toEqual([]);
  });

  it('isolates failures per server and retries later', async () => {
    messenger.failWith = new Error('discord down');
    await notify.executeForAll();
    expect(logger.entries.some((entry) => entry.level === 'error')).toBe(true);
    expect(dispatchLog.sent.size).toBe(0);
  });

  it('stays silent for inactive servers', async () => {
    guilds.add({ ...activeGuild('g1'), status: 'paused' });
    await notify.executeForAll();
    expect(messenger.reminders).toEqual([]);
  });
});
