import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryCalendarRepository,
  RecordingMessenger,
  SilentLogger,
  StubEmojiStore,
} from '../../test-support/fakes.js';
import { InMemoryGuildRepository, InMemoryPublicationRepository } from '../../test-support/fakes.js';
import { CheckTeamEmojis } from './check-team-emojis.js';
import { RefreshAnnouncements } from './refresh-announcements.js';
import { emojiNameFor, SyncTeamEmojis } from './sync-team-emojis.js';

const sync = (calendar: InMemoryCalendarRepository, emojis: StubEmojiStore, logger = new SilentLogger()) =>
  new SyncTeamEmojis(calendar, emojis, new FixedClock(new Date()), logger);

describe('SyncTeamEmojis', () => {
  it('uploads missing logos, remembers the emoji and reports what is still missing', async () => {
    const calendar = new InMemoryCalendarRepository();
    calendar.teamsMissingEmoji.push(
      { id: 1, shortName: 'G2', logoUrl: 'https://logo/g2.png' },
      { id: 2, shortName: 'FNC', logoUrl: 'https://logo/fnc.png' },
    );
    const emojis = new StubEmojiStore();
    emojis.failFor.add('FNC');
    const logger = new SilentLogger();

    expect(await sync(calendar, emojis, logger).execute()).toEqual({ linked: 1, missing: ['FNC'] });
    expect(calendar.emojis.get(1)).toBe('emoji-G2');
    expect(calendar.emojis.has(2)).toBe(false);
    expect(logger.entries.find((entry) => entry.level === 'warn')?.context).toEqual({
      teamId: 2,
      team: 'FNC',
      reason: 'upload failed',
    });
  });

  it('uses emojis added by hand first, even for teams without a logo', async () => {
    const calendar = new InMemoryCalendarRepository();
    calendar.teamsMissingEmoji.push(
      { id: 1, shortName: 'iG', logoUrl: 'https://logo/ig.png' },
      { id: 2, shortName: 'LYON', logoUrl: null },
      { id: 3, shortName: 'TSW', logoUrl: null },
    );
    const emojis = new StubEmojiStore();
    emojis.onServers.set('IG', 'manual-ig').set('LYON', 'manual-lyon');

    expect(await sync(calendar, emojis).execute()).toEqual({ linked: 2, missing: ['TSW'] });
    expect(calendar.emojis).toEqual(
      new Map([
        [1, 'manual-ig'],
        [2, 'manual-lyon'],
      ]),
    );
    expect(emojis.created).toEqual([]);
  });

  it('does nothing when every team has its emoji', async () => {
    expect(await sync(new InMemoryCalendarRepository(), new StubEmojiStore()).execute()).toEqual({
      linked: 0,
      missing: [],
    });
  });
});

describe('CheckTeamEmojis', () => {
  const check = (calendar: InMemoryCalendarRepository, emojis: StubEmojiStore, enabled = true) => {
    const messenger = new RecordingMessenger();
    const refresh = new RefreshAnnouncements(
      new InMemoryGuildRepository(),
      new InMemoryPublicationRepository(),
      calendar,
      messenger,
      new FixedClock(new Date()),
      new SilentLogger(),
    );
    let refreshes = 0;
    const executeForAll = refresh.executeForAll.bind(refresh);
    refresh.executeForAll = () => {
      refreshes += 1;
      return executeForAll();
    };
    return {
      run: () => new CheckTeamEmojis(sync(calendar, emojis), refresh, enabled).execute(),
      refreshes: () => refreshes,
    };
  };

  it('links emojis right away and refreshes announcements when logos were added', async () => {
    const calendar = new InMemoryCalendarRepository();
    calendar.teamsMissingEmoji.push({ id: 1, shortName: 'T1', logoUrl: null });
    const emojis = new StubEmojiStore();
    emojis.onServers.set('T1', 'manual-t1');
    const { run, refreshes } = check(calendar, emojis);
    expect(await run()).toEqual({ linked: 1, missing: [] });
    expect(refreshes()).toBe(1);
    expect(await run()).toEqual({ linked: 0, missing: [] });
    expect(refreshes()).toBe(1);
  });

  it('reports nothing when no emoji server is configured', async () => {
    const { run } = check(new InMemoryCalendarRepository(), new StubEmojiStore(), false);
    expect(await run()).toBeNull();
  });
});

describe('emojiNameFor', () => {
  it('keeps only characters Discord accepts, in capitals', () => {
    expect(emojiNameFor('G2')).toBe('G2');
    expect(emojiNameFor('iG')).toBe('IG');
    expect(emojiNameFor('KC Blue')).toBe('KCBLUE');
    expect(emojiNameFor('Bilibili Gaming Dreamsmart-Long-Name-Here')).toHaveLength(32);
  });

  it('pads names that end up too short', () => {
    expect(emojiNameFor('T')).toBe('team_T');
    expect(emojiNameFor('???')).toBe('team_');
  });
});
