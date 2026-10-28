import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryCalendarRepository,
  SilentLogger,
  StubEmojiStore,
} from '../../test-support/fakes.js';
import { emojiNameFor, SyncTeamEmojis } from './sync-team-emojis.js';

describe('SyncTeamEmojis', () => {
  it('uploads missing logos and remembers the emoji', async () => {
    const calendar = new InMemoryCalendarRepository();
    calendar.teamsMissingEmoji.push(
      { id: 1, shortName: 'G2', logoUrl: 'https://logo/g2.png' },
      { id: 2, shortName: 'FNC', logoUrl: 'https://logo/fnc.png' },
    );
    const emojis = new StubEmojiStore();
    emojis.failFor.add('FNC');
    const logger = new SilentLogger();

    const created = await new SyncTeamEmojis(calendar, emojis, new FixedClock(new Date()), logger).execute();

    expect(created).toBe(1);
    expect(calendar.emojis.get(1)).toBe('emoji-G2');
    expect(calendar.emojis.has(2)).toBe(false);
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('does nothing when every team has its emoji', async () => {
    const created = await new SyncTeamEmojis(
      new InMemoryCalendarRepository(),
      new StubEmojiStore(),
      new FixedClock(new Date()),
      new SilentLogger(),
    ).execute();
    expect(created).toBe(0);
  });
});

describe('emojiNameFor', () => {
  it('keeps only characters Discord accepts', () => {
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
