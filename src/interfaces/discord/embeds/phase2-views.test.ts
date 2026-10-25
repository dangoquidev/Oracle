import { describe, expect, it } from 'vitest';
import type { MatchView } from '../../../application/read-models/views.js';
import type { WeekMatchesResult } from '../../../application/use-cases/list-week-matches.js';
import { match, matchViewOf, team, week, weekView } from '../../../test-support/builders.js';
import { decodePrediction } from '../components/custom-id.js';
import { messages } from '../i18n/index.js';
import { renderLockReminder, renderVoteReveal } from './lock-notices.js';
import { voteLine } from './vote-lines.js';
import { renderWeekMatches } from './week-matches.js';

const g2 = { ...team(10, 'G2'), emojiId: '111' };
const fnc = team(20, 'FNC');
const bo3: MatchView = { ...matchViewOf(match({ id: 1, bestOf: 3 })), team1: g2, team2: fnc };
const bo1: MatchView = {
  ...matchViewOf(match({ id: 2, scheduledAt: new Date('2026-08-01T19:00:00Z') })),
  team1: fnc,
  team2: g2,
};

describe('voteLine', () => {
  it('shows the split, the count and the most picked score', () => {
    const line = voteLine(
      bo3,
      {
        total: 4,
        team1Percent: 75,
        team2Percent: 25,
        topScore: { score: { team1: 2, team2: 1 }, percent: 50 },
      },
      messages('fr'),
    );
    expect(line).toBe('G2 **75 %** · **25 %** FNC · 4 votes · score le plus joué : 2-1 G2 (50 %)');
  });

  it('handles single and missing votes', () => {
    const t = messages('en');
    expect(voteLine(bo1, { total: 1, team1Percent: 0, team2Percent: 100, topScore: null }, t)).toBe(
      'FNC **0%** · **100%** G2 · 1 vote',
    );
    expect(voteLine(bo1, { total: 0, team1Percent: 0, team2Percent: 0, topScore: null }, t)).toBe('no votes');
  });
});

describe('lock notices', () => {
  it('reminds the role with the closing time and a prediction button', () => {
    const view = renderLockReminder(
      {
        guildId: 'g',
        channelId: 'c',
        pingRoleId: '999',
        locale: 'fr',
        publicationId: 5,
        competitionName: 'LEC',
        weekName: 'Week 2',
        lockAt: new Date('2026-08-01T14:00:00Z'),
        matches: [bo3, bo1],
      },
      true,
    );
    expect(view.content).toMatch(/^<@&999> ⏰ Les votes ferment <t:\d+:R>/);
    const embed = view.embeds[0]?.toJSON();
    expect(embed?.title).toBe('LEC · Week 2');
    expect(embed?.description?.split('\n')).toHaveLength(2);
    const button = view.components[0]?.toJSON().components[0];
    expect(button && 'custom_id' in button ? decodePrediction(button.custom_id) : null).toEqual({
      action: 'open',
      publicationId: 5,
    });
  });

  it('reveals the server votes per match', () => {
    const view = renderVoteReveal(
      {
        guildId: 'g',
        channelId: 'c',
        locale: 'en',
        competitionName: 'LEC',
        weekName: 'Week 2',
        matches: [
          { match: bo1, distribution: { total: 3, team1Percent: 67, team2Percent: 33, topScore: null } },
        ],
      },
      false,
    );
    const embed = view.embeds[0]?.toJSON();
    expect(embed?.title).toBe('🔒 Voting closed · LEC · Week 2');
    expect(embed?.description).toContain('**FNC** vs **G2**\nFNC **67%** · **33%** G2 · 3 votes');
  });
});

describe('renderWeekMatches', () => {
  const week2 = week({ id: 2, name: 'Week 2' });
  const result: WeekMatchesResult = {
    locale: 'fr',
    timeZone: 'Europe/Paris',
    weeks: [
      {
        week: { ...weekView(week2, []), matches: [bo3, bo1] },
        items: [
          {
            match: bo3,
            lockAt: new Date('2026-08-01T14:00:00Z'),
            state: 'locked',
            distribution: { total: 2, team1Percent: 50, team2Percent: 50, topScore: null },
          },
          { match: bo1, lockAt: new Date('2026-08-01T17:00:00Z'), state: 'open', distribution: null },
        ],
      },
    ],
  };

  it('lists matches by day with their vote state', () => {
    const embed = renderWeekMatches(result, 'fr', true).embeds[0]?.toJSON();
    expect(embed?.title).toBe('LEC · Week 2');
    expect(embed?.description).toContain('**Samedi 1 août**');
    expect(embed?.description).toContain('-# 🔒 votes fermés · G2 **50 %** · **50 %** FNC · 2 votes');
    expect(embed?.description).toMatch(/-# 🟢 votes ouverts, fermeture <t:\d+:R>/);
  });

  it('says so when no week matches', () => {
    expect(renderWeekMatches({ ...result, weeks: [] }, 'en', false).content).toBe(
      'No week found for that period.',
    );
  });

  it('shows played and undecided matches', () => {
    const played = renderWeekMatches(
      {
        ...result,
        weeks: [
          {
            week: weekView(week2, []),
            items: [
              { match: bo1, lockAt: new Date(), state: 'closed', distribution: null },
              {
                match: { ...bo1, team2: null },
                lockAt: new Date(),
                state: 'awaiting-opponents',
                distribution: null,
              },
            ],
          },
        ],
      },
      'en',
      false,
    ).embeds[0]?.toJSON().description;
    expect(played).toContain('🏁 over');
    expect(played).toContain('⏳ teams to be decided');
  });

  it('notes an empty week', () => {
    const empty = renderWeekMatches(
      { ...result, weeks: [{ week: weekView(week2, []), items: [] }] },
      'fr',
      false,
    );
    expect(empty.embeds[0]?.toJSON().description).toBe('Aucun match prévu.');
  });
});
