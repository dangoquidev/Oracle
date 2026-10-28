import { describe, expect, it } from 'vitest';
import type { JudgedPrediction } from '../../../application/ports/prediction-repository.js';
import type { RoundPredictions } from '../../../application/use-cases/get-round-predictions.js';
import type { PredictionOutcome } from '../../../domain/scoring/score-prediction.js';
import { match, matchViewOf, team, week, weekView } from '../../../test-support/builders.js';
import { renderRoundPredictions, renderSharedPredictions } from './round-predictions.js';

const tes = team(10, 'TES');
const blg = team(20, 'BLG');
const bo3 = { ...matchViewOf(match({ id: 1, bestOf: 3 })), team1: tes, team2: blg };
const bo1 = {
  ...matchViewOf(match({ id: 2, scheduledAt: new Date('2026-08-01T19:00:00Z') })),
  team1: blg,
  team2: tes,
};

const pick = (
  userId: string,
  matchId: number,
  choice: JudgedPrediction['choice'],
  outcome: PredictionOutcome = { status: 'pending' },
): JudgedPrediction => ({ guildId: 'g', userId, matchId, choice, submittedAt: new Date(), outcome });

const result = (overrides: Partial<RoundPredictions> = {}): RoundPredictions => ({
  locale: 'fr',
  timeZone: 'Europe/Paris',
  weeks: [
    {
      week: { ...weekView(week({ id: 1, name: 'Round 4' }), []), competitionName: 'Worlds' },
      players: 3,
      items: [
        {
          match: bo3,
          lockAt: new Date('2026-08-01T14:00:00Z'),
          state: 'closed',
          outcome: { kind: 'decided', result: { winner: 1, score: { team1: 2, team2: 1 } } },
          distribution: null,
          picks: [
            pick(
              '1',
              1,
              { kind: 'score', score: { team1: 2, team2: 0 } },
              { status: 'scored', points: 1, correctWinner: true, exactScore: false },
            ),
            pick(
              '2',
              1,
              { kind: 'score', score: { team1: 2, team2: 1 } },
              { status: 'scored', points: 3, correctWinner: true, exactScore: true },
            ),
            pick(
              '3',
              1,
              { kind: 'score', score: { team1: 2, team2: 0 } },
              { status: 'scored', points: 1, correctWinner: true, exactScore: false },
            ),
          ],
        },
        {
          match: bo1,
          lockAt: new Date('2026-08-01T17:00:00Z'),
          state: 'open',
          outcome: { kind: 'pending' },
          distribution: null,
          picks: [],
        },
      ],
    },
  ],
  ...overrides,
});

describe('renderRoundPredictions', () => {
  it('groups players by pick, most popular first, and marks right ones once played', () => {
    const embed = renderRoundPredictions(result(), 'fr', false).embeds[0]?.toJSON();
    expect(embed?.title).toBe('Pronos · Worlds · Round 4');
    expect(embed?.description).toContain('**TES** vs **BLG** · Bo3\n-# 🏁 terminé · **TES 2-1 BLG**');
    expect(embed?.description).toContain('↳ ✅ **2-0 TES** (2) : <@1>, <@3>\n↳ 🎯 **2-1 TES** (1) : <@2>');
    expect(embed?.description).toContain('↳ *aucun prono*');
    expect(embed?.footer?.text).toMatch(/^3 joueurs · /);
  });

  it('says when there is no round', () => {
    expect(renderRoundPredictions(result({ weeks: [] }), 'en', false).content).toBe(
      'No week found for that period.',
    );
  });
});

describe('renderSharedPredictions', () => {
  it("lists the player's picks per week without pinging", () => {
    const embed = renderSharedPredictions(
      {
        guildId: 'g',
        channelId: 'c',
        locale: 'fr',
        userId: '42',
        groups: [
          {
            competitionName: 'Worlds',
            weekName: 'Round 4',
            picks: [
              { match: bo3, choice: { kind: 'score', score: { team1: 1, team2: 2 } } },
              { match: bo1, choice: { kind: 'winner', winner: 1 } },
            ],
          },
        ],
      },
      false,
    ).embeds[0]?.toJSON();
    expect(embed?.title).toBe('📝 Pronos validés');
    expect(embed?.description).toBe('<@42> a fait ses pronos :');
    expect(embed?.fields).toEqual([
      { name: 'Worlds · Round 4', value: '**TES** vs **BLG** → **2-1 BLG**\n**BLG** vs **TES** → **BLG**' },
    ]);
  });
});
