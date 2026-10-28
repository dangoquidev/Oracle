import { beforeEach, describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../config/competitions.js';
import type { PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import { activeGuild, match, matchViewOf, week, weekView } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryBanRepository,
  InMemoryCalendarRepository,
  InMemoryGuildRepository,
  InMemoryLockOverrideRepository,
  InMemoryPredictionRepository,
  InMemoryResultOverrideRepository,
  RecordingMessenger,
  SilentLogger,
} from '../../test-support/fakes.js';
import type { JourneyItem, PredictionJourney } from './get-prediction-journey.js';
import { GetRoundPredictions } from './get-round-predictions.js';
import { ListWeekMatches } from './list-week-matches.js';
import { LockCalculatorFactory } from './lock-calculator.js';
import { hasFinished, ShareFinishedPredictions } from './share-finished-predictions.js';

const team1: PredictionChoice = { kind: 'winner', winner: 1 };
const team2: PredictionChoice = { kind: 'winner', winner: 2 };

describe('GetRoundPredictions', () => {
  const round = week({ id: 1 });
  const first = match({ id: 1, scheduledAt: new Date('2026-08-01T16:00:00Z') });
  const second = match({ id: 2, scheduledAt: new Date('2026-08-01T19:00:00Z') });
  let guilds: InMemoryGuildRepository;
  let predictions: InMemoryPredictionRepository;
  let bans: InMemoryBanRepository;
  let calendar: InMemoryCalendarRepository;

  const pick = (userId: string, matchId: number, choice: PredictionChoice, minute: number) =>
    predictions.save({
      guildId: 'g1',
      userId,
      matchId,
      choice,
      submittedAt: new Date(Date.UTC(2026, 6, 31, 10, minute)),
    });
  const round_ = (competitionId: string | null = null) => {
    const weekMatches = new ListWeekMatches(
      guilds,
      calendar,
      predictions,
      new InMemoryResultOverrideRepository(),
      new LockCalculatorFactory(calendar, new InMemoryLockOverrideRepository()),
      COMPETITIONS,
      new FixedClock(new Date('2026-08-01T10:00:00Z')),
    );
    return new GetRoundPredictions(weekMatches, predictions, bans).execute('g1', competitionId);
  };

  beforeEach(async () => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1', { competitionIds: ['lec'] }));
    calendar = new InMemoryCalendarRepository();
    calendar.weeks.push(round);
    calendar.matches.push(first, second);
    calendar.views.push(weekView(round, [first, second]));
    predictions = new InMemoryPredictionRepository();
    bans = new InMemoryBanRepository();
    await pick('bob', 1, team2, 5);
    await pick('alice', 1, team1, 1);
    await pick('carol', 2, team1, 2);
    await pick('eve', 1, team1, 3);
  });

  it("lists everyone's picks on the current round, even while votes are open, in voting order", async () => {
    const result = await round_();
    if (!result.ok) throw new Error(result.error);
    const [lec] = result.value.weeks;
    expect(lec?.items.map((item) => [item.match.id, item.state, item.picks.map((p) => p.userId)])).toEqual([
      [1, 'open', ['alice', 'eve', 'bob']],
      [2, 'open', ['carol']],
    ]);
    expect(lec?.players).toBe(4);
  });

  it('leaves banned players out', async () => {
    await bans.ban({ guildId: 'g1', userId: 'eve', bannedBy: 'admin', reason: null, bannedAt: new Date() });
    const result = await round_();
    expect(result.ok && result.value.weeks[0]?.items[0]?.picks.map((p) => p.userId)).toEqual([
      'alice',
      'bob',
    ]);
    expect(result.ok && result.value.weeks[0]?.players).toBe(3);
  });

  it('forwards errors of the week listing', async () => {
    expect(await round_('worlds')).toEqual({ ok: false, error: 'competition-not-enabled' });
  });
});

describe('ShareFinishedPredictions', () => {
  const view = (id: number) => matchViewOf(match({ id }));
  const item = (overrides: Partial<JourneyItem> & Pick<JourneyItem, 'match'>): JourneyItem => ({
    competitionName: 'Worlds',
    weekName: 'Round 4',
    lockAt: new Date('2026-10-28T18:00:00Z'),
    state: 'open',
    choices: [team1, team2],
    current: null,
    outcome: { kind: 'pending' },
    judgement: null,
    distribution: null,
    ...overrides,
  });
  const journey = (items: JourneyItem[]): PredictionJourney => ({
    publicationId: 1,
    locale: 'fr',
    timeZone: 'Europe/Paris',
    items,
  });

  let guilds: InMemoryGuildRepository;
  let messenger: RecordingMessenger;
  let share: ShareFinishedPredictions;

  beforeEach(() => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
    messenger = new RecordingMessenger();
    share = new ShareFinishedPredictions(guilds, messenger, new SilentLogger());
  });

  it('is finished once every open match has a pick', () => {
    expect(hasFinished(journey([item({ match: view(1), current: team1 }), item({ match: view(2) })]))).toBe(
      false,
    );
    expect(
      hasFinished(
        journey([
          item({ match: view(1), current: team1 }),
          item({ match: view(2), state: 'locked' }),
          item({ match: view(3), state: 'awaiting-opponents' }),
        ]),
      ),
    ).toBe(true);
    expect(hasFinished(journey([item({ match: view(1), state: 'locked', current: team1 })]))).toBe(false);
  });

  it('posts the picks in the channel, grouped by week, every time it is finished', async () => {
    const finished = journey([
      item({ match: view(1), current: team1 }),
      item({ match: view(2), current: team2 }),
      item({ match: view(3), weekName: 'Round 5', current: team1 }),
      item({ match: view(4), weekName: 'Round 5', state: 'awaiting-opponents' }),
    ]);
    expect(await share.execute('g1', 'alice', finished)).toBe(true);
    expect(await share.execute('g1', 'alice', finished)).toBe(true);
    expect(messenger.shared).toHaveLength(2);
    expect(messenger.shared[0]).toMatchObject({
      guildId: 'g1',
      channelId: 'channel-1',
      locale: 'fr',
      userId: 'alice',
    });
    expect(
      messenger.shared[0]?.groups.map((group) => [group.weekName, group.picks.map((p) => p.match.id)]),
    ).toEqual([
      ['Round 4', [1, 2]],
      ['Round 5', [3]],
    ]);
  });

  it('stays quiet when not finished, on inactive servers, and when Discord fails', async () => {
    expect(await share.execute('g1', 'alice', journey([item({ match: view(1) })]))).toBe(false);
    const finished = journey([item({ match: view(1), current: team1 })]);
    expect(await share.execute('nope', 'alice', finished)).toBe(false);
    messenger.failWith = new Error('Missing Access');
    expect(await share.execute('g1', 'alice', finished)).toBe(false);
    expect(messenger.shared).toEqual([]);
  });
});
