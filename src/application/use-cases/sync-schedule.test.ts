import { beforeEach, describe, expect, it } from 'vitest';
import type { Competition } from '../../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../../domain/competition/scoring.js';
import {
  FixedClock,
  InMemoryCalendarRepository,
  SilentLogger,
  StubMatchDataProvider,
} from '../../test-support/fakes.js';
import type { ProviderMatch, ProviderTournament } from '../ports/match-data-provider.js';
import { buildCalendarSnapshot } from './build-calendar-snapshot.js';
import { SyncSchedule } from './sync-schedule.js';

const lec: Competition = { id: 'lec', name: 'LEC', source: { league: 'LEC' }, scoring: DEFAULT_SCORING };
const worlds: Competition = {
  id: 'worlds',
  name: 'Worlds',
  source: { league: 'Worlds' },
  scoring: DEFAULT_SCORING,
};

const tournament = (ref: string, split: string | null): ProviderTournament => ({
  ref,
  name: ref,
  year: '2026',
  split,
  startsOn: '2026-07-24',
  endsOn: '2026-08-30',
});

const providerMatch = (overrides: Partial<ProviderMatch> = {}): ProviderMatch => ({
  ref: 'm1',
  tournamentRef: 'LEC/Summer',
  weekName: 'Week 1',
  weekOrder: 1,
  matchDay: 1,
  team1: 'G2 Esports',
  team2: 'Fnatic',
  scheduledAt: new Date('2026-07-24T16:00:00Z'),
  bestOf: 3,
  team1Score: null,
  team2Score: null,
  winner: null,
  isNullified: false,
  ...overrides,
});

describe('buildCalendarSnapshot', () => {
  it('groups regular season and playoffs of a split into one season', () => {
    const { snapshot } = buildCalendarSnapshot({
      competition: lec,
      tournaments: [tournament('LEC/Summer', 'Summer'), tournament('LEC/Summer Playoffs', 'Summer')],
      matches: [],
      teams: [],
    });
    expect(snapshot.seasons).toEqual([{ key: '2026 Summer', name: 'LEC 2026 Summer' }]);
    expect(snapshot.tournaments.map((t) => t.seasonKey)).toEqual(['2026 Summer', '2026 Summer']);
  });

  it('maps statuses and results', () => {
    const { snapshot } = buildCalendarSnapshot({
      competition: lec,
      tournaments: [tournament('LEC/Summer', 'Summer')],
      matches: [
        providerMatch({ ref: 'upcoming' }),
        providerMatch({ ref: 'bo3', winner: 2, team1Score: 1, team2Score: 2 }),
        providerMatch({ ref: 'bo1', bestOf: 1, winner: 1, team1Score: 1, team2Score: 0 }),
        providerMatch({ ref: 'forfeit', winner: 1 }),
        providerMatch({ ref: 'void', isNullified: true, winner: 1 }),
      ],
      teams: [],
    });
    const byRef = new Map(snapshot.matches.map((m) => [m.ref, m]));
    expect(byRef.get('upcoming')).toMatchObject({ status: 'scheduled', result: null });
    expect(byRef.get('bo3')).toMatchObject({
      status: 'completed',
      result: { winner: 2, score: { team1: 1, team2: 2 } },
    });
    expect(byRef.get('bo1')).toMatchObject({ status: 'completed', result: { winner: 1, score: null } });
    expect(byRef.get('forfeit')).toMatchObject({ status: 'completed', result: { winner: 1, score: null } });
    expect(byRef.get('void')).toMatchObject({ status: 'nullified', result: null });
  });

  it('derives weeks once per tournament tab and keeps their order', () => {
    const { snapshot } = buildCalendarSnapshot({
      competition: lec,
      tournaments: [tournament('LEC/Summer', 'Summer')],
      matches: [
        providerMatch({ ref: 'a', weekName: 'Week 1', weekOrder: 1 }),
        providerMatch({ ref: 'b', weekName: 'Week 1', weekOrder: 1 }),
        providerMatch({ ref: 'c', weekName: 'Week 2', weekOrder: 2 }),
      ],
      teams: [],
    });
    expect(snapshot.weeks).toEqual([
      { tournamentRef: 'LEC/Summer', name: 'Week 1', order: 1 },
      { tournamentRef: 'LEC/Summer', name: 'Week 2', order: 2 },
    ]);
  });

  it('skips unsupported formats and matches of unknown tournaments', () => {
    const { snapshot, skippedMatchRefs } = buildCalendarSnapshot({
      competition: lec,
      tournaments: [tournament('LEC/Summer', 'Summer')],
      matches: [
        providerMatch({ ref: 'bo2', bestOf: 2 }),
        providerMatch({ ref: 'stray', tournamentRef: 'Other' }),
      ],
      teams: [],
    });
    expect(snapshot.matches).toEqual([]);
    expect(skippedMatchRefs).toEqual(['bo2', 'stray']);
  });

  it('includes every referenced team, falling back to its name when the provider has no details', () => {
    const { snapshot } = buildCalendarSnapshot({
      competition: lec,
      tournaments: [tournament('LEC/Summer', 'Summer')],
      matches: [providerMatch(), providerMatch({ ref: 'tbd', team2: null })],
      teams: [{ name: 'G2 Esports', shortName: 'G2', logoUrl: 'https://logo/g2.png' }],
    });
    expect(snapshot.teams).toEqual([
      { name: 'G2 Esports', shortName: 'G2', logoUrl: 'https://logo/g2.png' },
      { name: 'Fnatic', shortName: 'Fnatic', logoUrl: null },
    ]);
  });
});

describe('SyncSchedule', () => {
  let provider: StubMatchDataProvider;
  let calendar: InMemoryCalendarRepository;
  let logger: SilentLogger;
  const sync = (competitions: Competition[]) =>
    new SyncSchedule(
      provider,
      calendar,
      competitions,
      new FixedClock(new Date('2026-08-01T00:00:00Z')),
      logger,
    );

  beforeEach(() => {
    provider = new StubMatchDataProvider();
    calendar = new InMemoryCalendarRepository();
    logger = new SilentLogger();
  });

  it('stores one snapshot per competition', async () => {
    provider.tournaments.set('LEC', [tournament('LEC/Summer', 'Summer')]);
    provider.matches = [providerMatch()];
    provider.teams = [{ name: 'Fnatic', shortName: 'FNC', logoUrl: null }];

    const reports = await sync([lec]).execute();

    expect(reports).toEqual([{ competitionId: 'lec', tournaments: 1, matches: 1 }]);
    expect(calendar.snapshots).toHaveLength(1);
    expect(provider.teamRequests).toEqual([['G2 Esports', 'Fnatic']]);
  });

  it('skips competitions without current tournaments', async () => {
    expect(await sync([lec]).execute()).toEqual([{ competitionId: 'lec', tournaments: 0, matches: 0 }]);
    expect(calendar.snapshots).toEqual([]);
  });

  it('does not ask for teams when every opponent is unknown', async () => {
    provider.tournaments.set('LEC', [tournament('LEC/Summer', 'Summer')]);
    provider.matches = [providerMatch({ team1: null, team2: null })];
    await sync([lec]).execute();
    expect(provider.teamRequests).toEqual([]);
  });

  it('logs skipped matches', async () => {
    provider.tournaments.set('LEC', [tournament('LEC/Summer', 'Summer')]);
    provider.matches = [providerMatch({ bestOf: 2 })];
    await sync([lec]).execute();
    expect(logger.entries.find((entry) => entry.level === 'warn')?.message).toBe(
      'Skipped unsupported matches',
    );
  });

  it('can sync selected competitions without re-fetching cached teams', async () => {
    provider.tournaments.set('LEC', [tournament('LEC/Summer', 'Summer')]);
    provider.tournaments.set('Worlds', [tournament('Worlds/Main', null)]);
    provider.matches = [providerMatch()];
    calendar.knownTeamNames.add('G2 Esports');

    await sync([lec, worlds]).execute({ competitionIds: ['lec'], refreshKnownTeams: false });

    expect(provider.teamRequests).toEqual([['Fnatic']]);
    expect(calendar.snapshots.map((s) => s.competitionId)).toEqual(['lec']);
    expect(calendar.snapshots[0]?.teams.map((t) => t.name)).toEqual(['Fnatic']);
  });

  it('skips the team lookup when every team is cached', async () => {
    provider.tournaments.set('LEC', [tournament('LEC/Summer', 'Summer')]);
    provider.matches = [providerMatch()];
    calendar.knownTeamNames.add('G2 Esports').add('Fnatic');
    await sync([lec]).execute({ refreshKnownTeams: false });
    expect(provider.teamRequests).toEqual([]);
  });

  it('syncs the other competitions when one fails, then reports the failure', async () => {
    provider.failingLeagues.add('LEC');
    provider.tournaments.set('Worlds', [tournament('Worlds/Main', null)]);
    provider.matches = [providerMatch({ tournamentRef: 'Worlds/Main' })];

    await expect(sync([lec, worlds]).execute()).rejects.toThrow(AggregateError);
    expect(calendar.snapshots.map((s) => s.competitionId)).toEqual(['worlds']);
  });
});
