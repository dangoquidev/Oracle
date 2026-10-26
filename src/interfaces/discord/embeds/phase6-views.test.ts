import { describe, expect, it } from 'vitest';
import type { PlayerStatsReport } from '../../../application/use-cases/get-player-stats.js';
import { team } from '../../../test-support/builders.js';
import { messages } from '../i18n/index.js';
import { renderPlayerStats } from './stats.js';

const report = (overrides: Partial<PlayerStatsReport> = {}): PlayerStatsReport => ({
  locale: 'fr',
  userId: '42',
  banned: false,
  record: { points: 12, predictions: 10, correctWinners: 7, exactScores: 2, seriesPredictions: 4 },
  currentStreak: 3,
  bestStreak: 5,
  allTime: { rank: 1, players: 8, points: 12 },
  seasons: [{ name: 'LEC 2026 Summer', rank: 2, players: 6, points: 9 }],
  competitions: [
    { name: 'LEC', points: 9, predictions: 7, correctWinners: 5, exactScores: 2, seriesPredictions: 3 },
    { name: 'Worlds', points: 3, predictions: 3, correctWinners: 2, exactScores: 0, seriesPredictions: 1 },
  ],
  bestWeek: { competitionName: 'LEC', weekName: 'Week 3', points: 5 },
  favouriteTeam: { team: { ...team(10, 'G2'), emojiId: '999' }, picks: 4, correct: 3 },
  ...overrides,
});

describe('renderPlayerStats', () => {
  it('shows rankings, record, streaks, best week, favourite team and competitions', () => {
    const embed = renderPlayerStats(report(), 'Alice', 'fr', true).embeds[0]?.toJSON();
    expect(embed?.title).toBe('📊 Stats de Alice');
    expect(embed?.description).toBe('<@42>');
    expect(embed?.fields?.map((field) => [field.name, field.value])).toEqual([
      ['Classements', 'All time · **1er** / 8 · 12 pts\nLEC 2026 Summer · **2e** / 6 · 9 pts'],
      [
        'Pronos',
        '**12 pts** · 10 pronos notés\n✅ Bons vainqueurs : **7/10** (70 %)\n🎯 Scores exacts : **2/4** Bo3/Bo5 (50 %)',
      ],
      ['Séries de bons vainqueurs', '🔥 En cours : **3** · Record : **5**'],
      ['Meilleure semaine', 'LEC · Week 3 — **5 pts**'],
      ['Équipe favorite', '<:t:999> **G2** · pronostiquée gagnante 4 fois, 75 % de réussite'],
      ['Par compétition', '**LEC** — 9 pts · ✅ 5/7 · 🎯 2\n**Worlds** — 3 pts · ✅ 2/3'],
    ]);
  });

  it('skips what does not apply, in English', () => {
    const embed = renderPlayerStats(
      report({
        locale: 'en',
        record: { points: 1, predictions: 1, correctWinners: 1, exactScores: 0, seriesPredictions: 0 },
        allTime: { rank: 3, players: 3, points: 1 },
        seasons: [],
        competitions: [
          { name: 'LEC', points: 1, predictions: 1, correctWinners: 1, exactScores: 0, seriesPredictions: 0 },
        ],
        bestWeek: null,
        favouriteTeam: null,
      }),
      'Bob',
      'en',
      false,
    ).embeds[0]?.toJSON();
    expect(embed?.title).toBe("📊 Bob's stats");
    expect(embed?.fields?.map((field) => field.name)).toEqual([
      'Rankings',
      'Predictions',
      'Right-winner streaks',
    ]);
    expect(embed?.fields?.[0]?.value).toBe('All time · **3rd** / 3 · 1 pt');
    expect(embed?.fields?.[1]?.value).not.toContain('🎯');
  });

  it('flags banned players and players without judged predictions', () => {
    const banned = renderPlayerStats(
      report({ banned: true, allTime: null, seasons: [] }),
      'Eve',
      'fr',
      false,
    );
    expect(banned.embeds[0]?.toJSON().description).toBe(`<@42>\n${messages('fr').stats.banned}`);
    expect(banned.embeds[0]?.toJSON().fields?.[0]?.name).toBe('Pronos');

    const empty = renderPlayerStats(
      report({
        record: { points: 0, predictions: 0, correctWinners: 0, exactScores: 0, seriesPredictions: 0 },
      }),
      'Zoe',
      'fr',
      false,
    ).embeds[0]?.toJSON();
    expect(empty?.description).toBe('<@42>\n\nPas encore de prono noté sur ce serveur.');
    expect(empty?.fields).toBeUndefined();
  });

  it('writes English ordinals', () => {
    const t = messages('en');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103, 111].map((rank) => t.stats.rank(rank, 200))).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd', '111th'].map(
        (ordinal) => `**${ordinal}** / 200`,
      ),
    );
  });
});
