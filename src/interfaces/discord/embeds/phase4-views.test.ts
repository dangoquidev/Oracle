import { describe, expect, it } from 'vitest';
import type { MatchView } from '../../../application/read-models/views.js';
import type { Leaderboard } from '../../../application/use-cases/get-leaderboard.js';
import type { MyPredictionItem, MyPredictions } from '../../../application/use-cases/get-my-predictions.js';
import type { LeaderboardEntry } from '../../../domain/leaderboard/leaderboard.js';
import { match, matchViewOf, team, week, weekView } from '../../../test-support/builders.js';
import { renderLeaderboard } from './leaderboard.js';
import { renderMyPredictions } from './my-predictions.js';
import { renderMatchRecap, renderSeasonRecap } from './recaps.js';

const entry = (userId: string, rank: number, points: number, exactScores = 0): LeaderboardEntry => ({
  userId,
  rank,
  points,
  predictions: 4,
  correctWinners: 3,
  exactScores,
});

const board = (overrides: Partial<Leaderboard> = {}): Leaderboard => ({
  locale: 'fr',
  period: 'season',
  scopes: [{ competitionName: 'LEC', label: 'LEC 2026 Summer' }],
  entries: [entry('1', 1, 7, 2), entry('2', 1, 7), entry('3', 3, 1)],
  viewer: null,
  ...overrides,
});

const g2 = team(10, 'G2');
const fnc = team(20, 'FNC');
const played: MatchView = {
  ...matchViewOf(match({ id: 1, status: 'completed', result: { winner: 1, score: { team1: 2, team2: 1 } } })),
  team1: g2,
  team2: fnc,
};
const upcoming: MatchView = {
  ...matchViewOf(match({ id: 2, matchDay: 2, scheduledAt: new Date('2026-08-02T16:00:00Z') })),
  team1: fnc,
  team2: g2,
};

describe('renderLeaderboard', () => {
  it('lists players with medals, shared ranks and their record', () => {
    const embed = renderLeaderboard(board(), 'fr').embeds[0]?.toJSON();
    expect(embed?.title).toBe('🏆 Classement du split / tournoi');
    expect(embed?.description).toBe(
      [
        '-# LEC 2026 Summer',
        '',
        '🥇 <@1> — **7 pts** · ✅ 3/4 · 🎯 2',
        '🥇 <@2> — **7 pts** · ✅ 3/4',
        '🥉 <@3> — **1 pt** · ✅ 3/4',
      ].join('\n'),
    );
    expect(embed?.footer?.text).toBe('3 joueurs · ✅ bons vainqueurs · 🎯 scores exacts');
  });

  it('shows the viewer below the top when ranked lower', () => {
    const entries = Array.from({ length: 22 }, (_, index) => entry(`${index + 1}`, index + 1, 30 - index));
    const description = renderLeaderboard(
      board({ entries, viewer: entries[21] ?? null }),
      'en',
    ).embeds[0]?.toJSON().description;
    expect(description?.split('\n').slice(-2)).toEqual(['…', '**22.** <@22> — **9 pts** · ✅ 3/4']);
    expect(description).not.toContain('<@21>');
  });

  it('names the weeks of each competition, or all competitions all time', () => {
    const week = renderLeaderboard(
      board({
        period: 'week',
        scopes: [
          { competitionName: 'Worlds', label: 'Round 3' },
          { competitionName: 'LEC', label: 'Week 2' },
        ],
      }),
      'fr',
    );
    expect(week.embeds[0]?.toJSON().description).toMatch(/^-# Worlds · Round 3 — LEC · Week 2\n/);
    const allTime = renderLeaderboard(board({ period: 'alltime', scopes: [] }), 'en');
    expect(allTime.embeds[0]?.toJSON()).toMatchObject({ title: '🏆 All-time leaderboard' });
    expect(allTime.embeds[0]?.toJSON().description).toMatch(/^-# All competitions\n/);
  });

  it('explains empty boards', () => {
    const notStarted = renderLeaderboard(board({ period: 'week', scopes: [], entries: [] }), 'fr');
    expect(notStarted.embeds[0]?.toJSON().description).toContain('la période n’a pas encore commencé');
    expect(notStarted.embeds[0]?.toJSON().footer).toBeUndefined();
    const noPoints = renderLeaderboard(board({ entries: [] }), 'en');
    expect(noPoints.embeds[0]?.toJSON().description).toContain('No points scored yet.');
  });
});

describe('renderMyPredictions', () => {
  const item = (
    overrides: Partial<MyPredictionItem> & Pick<MyPredictionItem, 'match'>,
  ): MyPredictionItem => ({
    lockAt: new Date('2026-08-01T14:00:00Z'),
    state: 'closed',
    outcome: { kind: 'pending' },
    distribution: null,
    prediction: null,
    ...overrides,
  });
  const result = (items: MyPredictionItem[], picked = 1): MyPredictions => ({
    locale: 'fr',
    timeZone: 'Europe/Paris',
    weeks: [
      {
        week: weekView(week(), []),
        items,
        totals: { picked, judged: 1, points: 3, correctWinners: 1, exactScores: 1 },
      },
    ],
  });

  it('shows each pick with the result and the points earned', () => {
    const view = renderMyPredictions(
      result([
        item({
          match: played,
          outcome: { kind: 'decided', result: { winner: 1, score: { team1: 2, team2: 1 } } },
          prediction: {
            guildId: 'g',
            userId: 'u',
            matchId: 1,
            choice: { kind: 'score', score: { team1: 2, team2: 1 } },
            submittedAt: new Date(),
            outcome: { status: 'scored', points: 3, correctWinner: true, exactScore: true },
          },
        }),
        item({ match: upcoming, state: 'open', lockAt: new Date('2026-08-02T14:00:00Z') }),
      ]),
      'fr',
      false,
    );
    const embed = view.embeds[0]?.toJSON();
    expect(embed?.title).toBe('Mes pronos · LEC · Week 1');
    expect(embed?.description).toContain('-# ton prono : **2-1 G2** · 🏁 **G2 2-1 FNC** · +3 pts');
    expect(embed?.description).toMatch(/✅ <t:\d+:t> · \*\*G2\*\* vs \*\*FNC\*\*/);
    expect(embed?.description).toMatch(
      /▫️ <t:\d+:t> · \*\*FNC\*\* vs \*\*G2\*\*\n-# 🟢 pas encore de prono, fermeture <t:\d+:R>/,
    );
    expect(embed?.fields).toEqual([
      { name: 'Total de la semaine', value: '**3 pts** · 1 prono · ✅ 1/1 · 🎯 1' },
    ]);
  });

  it('marks missed and cancelled matches and hides totals without picks', () => {
    const view = renderMyPredictions(
      result([item({ match: played, state: 'locked' }), item({ match: upcoming, state: 'cancelled' })], 0),
      'en',
      false,
    );
    const embed = view.embeds[0]?.toJSON();
    expect(embed?.description).toContain('➖');
    expect(embed?.description).toContain('-# no pick · 🔒 voting closed');
    expect(embed?.description).toContain('🚫');
    expect(embed?.fields).toBeUndefined();
  });

  it('says when there is no week', () => {
    expect(renderMyPredictions({ locale: 'en', timeZone: 'UTC', weeks: [] }, 'en', false).content).toBe(
      'No week found for that period.',
    );
  });
});

describe('recaps', () => {
  const base = {
    guildId: 'g',
    channelId: 'c',
    locale: 'fr' as const,
    competitionName: 'LEC',
    weekName: 'Week 1',
    startsAt: new Date('2026-08-07T16:00:00Z'),
    timeZone: 'Europe/Paris',
    matches: [
      {
        match: played,
        outcome: { kind: 'decided', result: { winner: 1, score: { team1: 2, team2: 1 } } } as const,
        predictions: 3,
        correctWinners: 2,
      },
      { match: upcoming, outcome: { kind: 'void' } as const, predictions: 0, correctWinners: 0 },
    ],
    standings: [entry('1', 1, 4)],
    season: { name: 'LEC 2026 Summer', standings: [entry('1', 1, 12), entry('2', 2, 9)] },
  };

  it('sums up a day with results, right picks and standings', () => {
    const embed = renderMatchRecap({ ...base, kind: 'day' }, false).embeds[0]?.toJSON();
    expect(embed?.title).toBe('📋 Récap · LEC · Vendredi 7 août');
    expect(embed?.description).toBe(
      [
        '**Résultats**',
        '🏁 **G2** vs **FNC** · **G2 2-1 FNC** · 67 % de bons pronos (2/3)',
        '🚫 **FNC** vs **G2** · **match annulé**',
      ].join('\n'),
    );
    expect(embed?.fields?.map((field) => field.name)).toEqual([
      'Meilleurs pronostiqueurs de la journée',
      'Classement · LEC 2026 Summer',
    ]);
    expect(embed?.fields?.[1]?.value).toBe('🥇 <@1> — **12 pts** · ✅ 3/4\n🥈 <@2> — **9 pts** · ✅ 3/4');
  });

  it('names the week in weekly mode and skips empty standings', () => {
    const embed = renderMatchRecap(
      { ...base, kind: 'week', standings: [], season: null },
      false,
    ).embeds[0]?.toJSON();
    expect(embed?.title).toBe('📋 Récap · LEC · Week 1');
    expect(embed?.fields).toBeUndefined();
  });

  it('crowns the season winners, ties included', () => {
    const embed = renderSeasonRecap({
      guildId: 'g',
      channelId: 'c',
      locale: 'en',
      competitionName: 'Worlds',
      seasonName: 'Worlds 2026',
      standings: [entry('1', 1, 20), entry('2', 1, 20), entry('3', 3, 4)],
      players: 3,
    }).embeds[0]?.toJSON();
    expect(embed?.title).toBe('🏆 Final standings · Worlds 2026');
    expect(embed?.description).toMatch(/^It is over! Here are the final standings:\n\n🥇 <@1>/);
    expect(embed?.description).toMatch(/Congratulations <@1>, <@2> 👑$/);
    expect(embed?.footer?.text).toBe('3 players · ✅ right winners · 🎯 exact scores');
  });
});
