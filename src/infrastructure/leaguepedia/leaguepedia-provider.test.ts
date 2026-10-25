import { describe, expect, it } from 'vitest';
import { SilentLogger } from '../../test-support/fakes.js';
import { cargoString, parseFlag, parseIntOrNull, parseUtcDateTime } from './cargo-values.js';
import type { CargoQuery, CargoRow, LeaguepediaClient } from './leaguepedia-client.js';
import { LeaguepediaProvider } from './leaguepedia-provider.js';

class StubClient {
  readonly cargoQueries: CargoQuery[] = [];
  readonly plainQueries: Record<string, string>[] = [];
  constructor(
    private readonly rowsFor: (query: CargoQuery) => CargoRow[],
    private readonly queryResponse: unknown = {},
  ) {}
  cargoQuery(query: CargoQuery): Promise<CargoRow[]> {
    this.cargoQueries.push(query);
    return Promise.resolve(this.rowsFor(query));
  }
  query(params: Record<string, string>): Promise<unknown> {
    this.plainQueries.push(params);
    return Promise.resolve(this.queryResponse);
  }
}

const provider = (client: StubClient, logger = new SilentLogger()) =>
  new LeaguepediaProvider(client as unknown as LeaguepediaClient, logger);

describe('LeaguepediaProvider', () => {
  it('queries tournaments of a league still running', async () => {
    const client = new StubClient(() => [
      {
        Name: 'Worlds 2026 Main Event',
        Page: '2026 Season World Championship/Main Event',
        Year: '2026',
        Split: '',
        StartsOn: '2026-10-23',
        EndsOn: '2026-11-14',
      },
      { Name: 'Broken', Page: '', Year: '2026' },
    ]);

    const tournaments = await provider(client).fetchTournaments(
      { league: 'World Championship', tournamentPagePattern: '% Season World Championship/%' },
      new Date('2026-09-25T12:00:00Z'),
    );

    expect(tournaments).toEqual([
      {
        ref: '2026 Season World Championship/Main Event',
        name: 'Worlds 2026 Main Event',
        year: '2026',
        split: null,
        startsOn: '2026-10-23',
        endsOn: '2026-11-14',
      },
    ]);
    expect(client.cargoQueries[0]?.where).toBe(
      "T.League = 'World Championship' AND (T.Date >= '2026-09-25' OR T.Date IS NULL) AND T.OverviewPage LIKE '% Season World Championship/%'",
    );
  });

  it('omits the page filter when the competition has none', async () => {
    const client = new StubClient(() => []);
    await provider(client).fetchTournaments(
      { league: 'LoL EMEA Championship' },
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(client.cargoQueries[0]?.where).not.toContain('LIKE');
  });

  it('maps schedule rows, with unknown opponents and results', async () => {
    const logger = new SilentLogger();
    const client = new StubClient(() => [
      {
        MatchId: 'Main Event_Round 1_1',
        Page: 'Main Event',
        Tab: 'Round 1',
        TabOrder: '1',
        MatchDay: '2',
        Team1: 'G2 Esports',
        Team2: 'TBD',
        StartsAt: '2026-10-23 15:00:00',
        BestOf: '3',
        Team1Score: '2',
        Team2Score: '1',
        Winner: '1',
        IsNullified: '0',
      },
      { MatchId: 'incomplete', Page: 'Main Event', Tab: 'Round 1', StartsAt: '', BestOf: '1' },
    ]);

    const matches = await provider(client, logger).fetchMatches(['Main Event']);

    expect(matches).toEqual([
      {
        ref: 'Main Event_Round 1_1',
        tournamentRef: 'Main Event',
        weekName: 'Round 1',
        weekOrder: 1,
        matchDay: 2,
        team1: 'G2 Esports',
        team2: null,
        scheduledAt: new Date('2026-10-23T15:00:00Z'),
        bestOf: 3,
        team1Score: 2,
        team2Score: 1,
        winner: 1,
        isNullified: false,
      },
    ]);
    expect(client.cargoQueries[0]?.where).toBe("MS.OverviewPage IN ('Main Event')");
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('fetches teams with their logo thumbnails, matching page names too', async () => {
    const client = new StubClient(
      () => [
        { Name: 'G2 Esports', Page: 'G2 Esports', Short: 'G2', Image: 'G2 Esportslogo square.png' },
        { Name: 'LYON', Page: 'LYON (2024 American Team)', Short: '', Image: 'LYON_logo.png' },
      ],
      {
        query: {
          pages: [
            {
              title: 'File:G2 Esportslogo square.png',
              imageinfo: [{ thumburl: 'https://img/g2-128.png', url: 'x' }],
            },
            { title: 'File:LYON logo.png', imageinfo: [{ url: 'https://img/lyon.png' }] },
            { title: 'File:Missing.png' },
            { nonsense: true },
          ],
        },
      },
    );

    const teams = await provider(client).fetchTeams([
      'G2 Esports',
      'LYON (2024 American Team)',
      'Unknown (Team)',
    ]);

    expect(teams).toEqual([
      { name: 'G2 Esports', shortName: 'G2', logoUrl: 'https://img/g2-128.png' },
      { name: 'LYON (2024 American Team)', shortName: 'LYON', logoUrl: 'https://img/lyon.png' },
      { name: 'Unknown (Team)', shortName: 'Unknown', logoUrl: null },
    ]);
    expect(client.plainQueries[0]).toMatchObject({ prop: 'imageinfo', iiurlwidth: '128' });
  });

  it('skips the image lookup when no team has a logo', async () => {
    const client = new StubClient(() => [{ Name: 'X', Page: 'X', Short: 'X', Image: '' }], { weird: true });
    expect(await provider(client).fetchTeams(['X'])).toEqual([{ name: 'X', shortName: 'X', logoUrl: null }]);
    expect(client.plainQueries).toEqual([]);
  });
});

describe('cargo values', () => {
  it('escapes quotes and backslashes', () => {
    expect(cargoString("Anyone's Legend")).toBe("'Anyone\\'s Legend'");
    expect(cargoString('a\\b')).toBe("'a\\\\b'");
  });

  it('parses numbers, flags and UTC datetimes', () => {
    expect([parseIntOrNull('3'), parseIntOrNull(''), parseIntOrNull('x'), parseIntOrNull(null)]).toEqual([
      3,
      null,
      null,
      null,
    ]);
    expect([parseFlag('1'), parseFlag('Yes'), parseFlag('0'), parseFlag(undefined)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(parseUtcDateTime('2026-10-23 15:00:00')).toEqual(new Date('2026-10-23T15:00:00Z'));
    expect(parseUtcDateTime('garbage')).toBeNull();
  });
});
