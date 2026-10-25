import { describe, expect, it } from 'vitest';
import type { WeekAnnouncement } from '../../../application/ports/guild-messenger.js';
import { match, matchViewOf, team, week, weekView } from '../../../test-support/builders.js';
import { decodePrediction } from '../components/custom-id.js';
import { messages } from '../i18n/index.js';
import { choiceLabel, dayHeading, teamLabel, truncate } from './formatting.js';
import { renderPauseNotice, renderWelcome } from './notices.js';
import { renderWeekAnnouncement } from './week-announcement.js';

const g2 = { ...team(10, 'G2'), emojiId: '111' };
const fnc = team(20, 'FNC');

describe('formatting', () => {
  const t = messages('fr');
  const view = { ...weekView(week(), [match()]).matches[0], team1: g2, team2: fnc } as never;

  it('shows logos only when allowed and available', () => {
    expect(teamLabel(g2, t, true)).toBe('<:t:111> **G2**');
    expect(teamLabel(g2, t, false)).toBe('**G2**');
    expect(teamLabel(fnc, t, true)).toBe('**FNC**');
    expect(teamLabel(null, t, true)).toBe('*À déterminer*');
  });

  it('labels picks with the winner score first', () => {
    expect(choiceLabel({ kind: 'winner', winner: 2 }, view, t)).toBe('FNC');
    expect(choiceLabel({ kind: 'score', score: { team1: 2, team2: 1 } }, view, t)).toBe('2-1 G2');
    expect(choiceLabel({ kind: 'score', score: { team1: 0, team2: 2 } }, view, t)).toBe('2-0 FNC');
  });

  it('formats day headings in the server time zone', () => {
    expect(dayHeading(new Date('2026-08-07T22:30:00Z'), 'Europe/Paris', 'fr')).toBe('Samedi 8 août');
    expect(dayHeading(new Date('2026-08-07T22:30:00Z'), 'UTC', 'en')).toBe('Friday 7 August');
  });

  it('truncates long texts', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});

describe('renderWeekAnnouncement', () => {
  const week1 = week({ id: 1, name: 'Week 3' });
  const announcement: WeekAnnouncement = {
    guildId: 'g',
    channelId: 'c',
    pingRoleId: '999',
    locale: 'fr',
    timeZone: 'Europe/Paris',
    publicationId: 42,
    weeks: [
      {
        week: week1,
        competitionName: 'LEC',
        matches: [
          {
            ...matchViewOf(match({ id: 1, scheduledAt: new Date('2026-08-07T16:00:00Z') })),
            team1: g2,
            team2: fnc,
          },
          {
            ...matchViewOf(match({ id: 2, scheduledAt: new Date('2026-08-08T16:00:00Z'), bestOf: 3 })),
            team1: fnc,
            team2: null,
          },
        ],
      },
      { week: week({ id: 2, name: 'Empty' }), competitionName: 'Worlds', matches: [] },
    ],
  };

  it('pings the role and lists matches grouped by day', () => {
    const view = renderWeekAnnouncement(announcement, true);
    expect(view.content).toBe('<@&999> les pronos de la semaine sont ouverts !');

    const [first, second] = view.embeds.map((embed) => embed.toJSON());
    expect(first?.title).toBe('LEC · Week 3');
    expect(first?.description).toContain('**Vendredi 7 août**');
    expect(first?.description).toContain('<:t:111> **G2** vs **FNC** · Bo1');
    expect(first?.description).toContain('**Samedi 8 août**');
    expect(first?.description).toContain('**FNC** vs *À déterminer* · Bo3');
    expect(first?.footer?.text).toContain('Leaguepedia');
    expect(second?.description).toBe('Aucun match prévu.');
  });

  it('offers a button opening the prediction journey', () => {
    const [row] = renderWeekAnnouncement(announcement, false).components;
    const button = row?.toJSON().components[0];
    expect(button && 'custom_id' in button ? decodePrediction(button.custom_id) : null).toEqual({
      action: 'open',
      publicationId: 42,
    });
  });

  it('drops emojis when the channel forbids external ones', () => {
    const [embed] = renderWeekAnnouncement(announcement, false).embeds;
    expect(embed?.toJSON().description).not.toContain('<:t:');
  });
});

describe('notices', () => {
  it('greets in both languages', () => {
    const description = renderWelcome().embeds[0]?.toJSON().description ?? '';
    expect(description).toContain('`/configure`');
    expect(description).toContain('🇫🇷');
    expect(description).toContain('🇬🇧');
  });

  it('explains why the bot is paused', () => {
    const embed = renderPauseNotice('channel-deleted', 'en').embeds[0]?.toJSON();
    expect(embed?.description).toContain('The announcement channel was deleted.');
  });
});
