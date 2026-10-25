import type {
  MatchDataProvider,
  ProviderMatch,
  ProviderTeam,
  ProviderTournament,
} from '../../application/ports/match-data-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import type { CompetitionSource } from '../../domain/competition/competition.js';
import { chunk } from '../support/chunk.js';
import {
  blankToNull,
  cargoList,
  cargoString,
  parseFlag,
  parseIntOrNull,
  parseUtcDateTime,
  toCargoDate,
} from './cargo-values.js';
import type { CargoRow, LeaguepediaClient } from './leaguepedia-client.js';

const TOURNAMENTS_PER_QUERY = 20;
const TEAMS_PER_QUERY = 50;
const LOGO_WIDTH_PX = 128;
/** Placeholder Leaguepedia uses for opponents not decided yet. */
const UNKNOWN_TEAM = 'TBD';

export class LeaguepediaProvider implements MatchDataProvider {
  constructor(
    private readonly client: LeaguepediaClient,
    private readonly logger: Logger,
  ) {}

  async fetchTournaments(source: CompetitionSource, endingAfter: Date): Promise<ProviderTournament[]> {
    const conditions = [
      `T.League = ${cargoString(source.league)}`,
      `(T.Date >= ${cargoString(toCargoDate(endingAfter))} OR T.Date IS NULL)`,
      ...(source.tournamentPagePattern
        ? [`T.OverviewPage LIKE ${cargoString(source.tournamentPagePattern)}`]
        : []),
    ];
    const rows = await this.client.cargoQuery({
      tables: 'Tournaments=T',
      fields:
        'T.Name=Name, T.OverviewPage=Page, T.Year=Year, T.Split=Split, T.DateStart=StartsOn, T.Date=EndsOn',
      where: conditions.join(' AND '),
      orderBy: 'T.DateStart',
    });
    return rows.flatMap((row) => {
      const ref = blankToNull(row.Page);
      const year = blankToNull(row.Year);
      if (ref === null || year === null) return [];
      return [
        {
          ref,
          name: blankToNull(row.Name) ?? ref,
          year,
          split: blankToNull(row.Split),
          startsOn: blankToNull(row.StartsOn),
          endsOn: blankToNull(row.EndsOn),
        },
      ];
    });
  }

  async fetchMatches(tournamentRefs: readonly string[]): Promise<ProviderMatch[]> {
    const matches: ProviderMatch[] = [];
    for (const refs of chunk(tournamentRefs, TOURNAMENTS_PER_QUERY)) {
      const rows = await this.client.cargoQuery({
        tables: 'MatchSchedule=MS',
        fields: [
          'MS.MatchId=MatchId',
          'MS.OverviewPage=Page',
          'MS.Tab=Tab',
          'MS.N_TabInPage=TabOrder',
          'MS.MatchDay=MatchDay',
          'MS.Team1=Team1',
          'MS.Team2=Team2',
          'MS.DateTime_UTC=StartsAt',
          'MS.BestOf=BestOf',
          'MS.Team1Score=Team1Score',
          'MS.Team2Score=Team2Score',
          'MS.Winner=Winner',
          'MS.IsNullified=IsNullified',
        ].join(', '),
        where: `MS.OverviewPage IN ${cargoList(refs)}`,
        orderBy: 'MS.DateTime_UTC',
      });
      for (const row of rows) {
        const match = toProviderMatch(row);
        if (match) matches.push(match);
        else this.logger.warn({ matchId: row.MatchId }, 'Ignoring incomplete Leaguepedia match row');
      }
    }
    return matches;
  }

  async fetchTeams(names: readonly string[]): Promise<ProviderTeam[]> {
    const teams: ProviderTeam[] = [];
    for (const batch of chunk(names, TEAMS_PER_QUERY)) {
      // Schedules reference teams by page name, which may carry a disambiguation suffix.
      const rows = await this.client.cargoQuery({
        tables: 'Teams=T',
        fields: 'T.Name=Name, T.OverviewPage=Page, T.Short=Short, T.Image=Image',
        where: `T.Name IN ${cargoList(batch)} OR T.OverviewPage IN ${cargoList(batch)}`,
      });
      const logos = await this.fetchLogoUrls(
        rows.map((row) => blankToNull(row.Image)).filter((file) => file !== null),
      );
      const rowsByName = new Map<string, CargoRow>();
      for (const row of rows) {
        for (const key of [blankToNull(row.Page), blankToNull(row.Name)]) {
          if (key !== null && !rowsByName.has(key)) rowsByName.set(key, row);
        }
      }
      for (const name of batch) {
        const row = rowsByName.get(name);
        const image = blankToNull(row?.Image);
        teams.push({
          name,
          shortName: blankToNull(row?.Short) ?? withoutDisambiguation(name),
          logoUrl: image === null ? null : (logos.get(image) ?? null),
        });
      }
    }
    return teams;
  }

  /** Resolves file names to thumbnail URLs small enough to become Discord emojis. */
  private async fetchLogoUrls(files: readonly string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (files.length === 0) return urls;
    const response = await this.client.query({
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(LOGO_WIDTH_PX),
      titles: files.map((file) => `File:${file}`).join('|'),
    });
    for (const page of pagesOf(response)) {
      const file = page.title.replace(/^File:/, '');
      if (page.url) urls.set(normalizeFileName(file), page.url);
    }
    return new Map(
      files.flatMap((file) => {
        const url = urls.get(normalizeFileName(file));
        return url ? [[file, url] as const] : [];
      }),
    );
  }
}

function toProviderMatch(row: CargoRow): ProviderMatch | null {
  const ref = blankToNull(row.MatchId);
  const tournamentRef = blankToNull(row.Page);
  const weekName = blankToNull(row.Tab);
  const scheduledAt = parseUtcDateTime(row.StartsAt);
  const bestOf = parseIntOrNull(row.BestOf);
  if (
    ref === null ||
    tournamentRef === null ||
    weekName === null ||
    scheduledAt === null ||
    bestOf === null
  ) {
    return null;
  }
  const winner = parseIntOrNull(row.Winner);
  return {
    ref,
    tournamentRef,
    weekName,
    weekOrder: parseIntOrNull(row.TabOrder) ?? 0,
    matchDay: parseIntOrNull(row.MatchDay),
    team1: teamName(row.Team1),
    team2: teamName(row.Team2),
    scheduledAt,
    bestOf,
    team1Score: parseIntOrNull(row.Team1Score),
    team2Score: parseIntOrNull(row.Team2Score),
    winner: winner === 1 || winner === 2 ? winner : null,
    isNullified: parseFlag(row.IsNullified),
  };
}

/** "LYON (2024 American Team)" → "LYON" */
function withoutDisambiguation(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '') || name;
}

function teamName(value: string | null | undefined): string | null {
  const name = blankToNull(value);
  return name === null || name === UNKNOWN_TEAM ? null : name;
}

/** MediaWiki normalises file titles: first letter uppercase, underscores as spaces. */
function normalizeFileName(file: string): string {
  const spaced = file.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function pagesOf(response: unknown): { title: string; url: string | null }[] {
  const query =
    typeof response === 'object' && response !== null && 'query' in response ? response.query : null;
  const pages = typeof query === 'object' && query !== null && 'pages' in query ? query.pages : null;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page: unknown) => {
    if (typeof page !== 'object' || page === null || !('title' in page) || typeof page.title !== 'string')
      return [];
    const info = 'imageinfo' in page && Array.isArray(page.imageinfo) ? (page.imageinfo[0] as unknown) : null;
    const url = imageUrlOf(info);
    return [{ title: page.title, url }];
  });
}

function imageUrlOf(info: unknown): string | null {
  if (typeof info !== 'object' || info === null) return null;
  const thumb = 'thumburl' in info && typeof info.thumburl === 'string' ? info.thumburl : null;
  const full = 'url' in info && typeof info.url === 'string' ? info.url : null;
  return thumb ?? full;
}
