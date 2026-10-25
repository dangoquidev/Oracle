import type { CalendarSnapshot } from '../../../src/application/ports/calendar-repository.js';

type SnapshotMatch = CalendarSnapshot['matches'][number];

export const snapshotMatch = (overrides: Partial<SnapshotMatch> = {}): SnapshotMatch => ({
  ref: 'LEC_W1_1',
  tournamentRef: 'LEC/2026 Season/Summer Season',
  weekName: 'Week 1',
  matchDay: 1,
  team1: 'G2 Esports',
  team2: 'Fnatic',
  scheduledAt: new Date('2026-07-24T16:00:00Z'),
  bestOf: 3,
  status: 'scheduled',
  result: null,
  ...overrides,
});

export const lecSnapshot = (matches: readonly SnapshotMatch[] = [snapshotMatch()]): CalendarSnapshot => ({
  competitionId: 'lec',
  seasons: [{ key: '2026 Summer', name: 'LEC 2026 Summer' }],
  tournaments: [
    {
      ref: 'LEC/2026 Season/Summer Season',
      seasonKey: '2026 Summer',
      name: 'LEC 2026 Summer',
      startsOn: '2026-07-24',
      endsOn: '2026-08-30',
    },
  ],
  weeks: [...new Set(matches.map((m) => m.weekName))].map((name, index) => ({
    tournamentRef: 'LEC/2026 Season/Summer Season',
    name,
    order: index + 1,
  })),
  teams: [
    { name: 'G2 Esports', shortName: 'G2', logoUrl: 'https://img/g2.png' },
    { name: 'Fnatic', shortName: 'FNC', logoUrl: null },
    { name: 'Karmine Corp', shortName: 'KC', logoUrl: 'https://img/kc.png' },
  ],
  matches,
});
