import type { Competition } from '../../domain/competition/competition.js';
import { seasonKeyOf } from '../../domain/competition/season.js';
import { parseBestOf, type BestOf } from '../../domain/match/best-of.js';
import type { MatchResult, MatchStatus } from '../../domain/match/match.js';
import type { CalendarSnapshot } from '../ports/calendar-repository.js';
import type { ProviderMatch, ProviderTeam, ProviderTournament } from '../ports/match-data-provider.js';

export interface SnapshotInput {
  readonly competition: Competition;
  readonly tournaments: readonly ProviderTournament[];
  readonly matches: readonly ProviderMatch[];
  readonly teams: readonly ProviderTeam[];
}

export interface BuiltSnapshot {
  readonly snapshot: CalendarSnapshot;
  /** Provider matches left out because their format is not supported. */
  readonly skippedMatchRefs: readonly string[];
}

/** Turns raw provider data into the normalised calendar of one competition. */
export function buildCalendarSnapshot({
  competition,
  tournaments,
  matches,
  teams,
}: SnapshotInput): BuiltSnapshot {
  const tournamentRefs = new Set(tournaments.map((tournament) => tournament.ref));
  const skippedMatchRefs: string[] = [];
  const supported: { match: ProviderMatch; bestOf: BestOf }[] = [];
  for (const match of matches) {
    const bestOf = parseBestOf(match.bestOf);
    if (bestOf === null || !tournamentRefs.has(match.tournamentRef)) skippedMatchRefs.push(match.ref);
    else supported.push({ match, bestOf });
  }

  const seasons = uniqueBy(
    tournaments.map((tournament) => {
      const key = seasonKeyOf(tournament);
      return { key, name: `${competition.name} ${key}` };
    }),
    (season) => season.key,
  );

  const weeks = uniqueBy(
    supported.map(({ match }) => ({
      tournamentRef: match.tournamentRef,
      name: match.weekName,
      order: match.weekOrder,
    })),
    (week) => `${week.tournamentRef}\u0000${week.name}`,
  );

  const teamsByName = new Map(teams.map((team) => [team.name, team]));
  const teamNames = new Set(supported.flatMap(({ match }) => [match.team1, match.team2]).filter(isPresent));
  const snapshotTeams = [...teamNames].map(
    (name) => teamsByName.get(name) ?? { name, shortName: name, logoUrl: null },
  );

  return {
    skippedMatchRefs,
    snapshot: {
      competitionId: competition.id,
      seasons,
      tournaments: tournaments.map((tournament) => ({
        ref: tournament.ref,
        seasonKey: seasonKeyOf(tournament),
        name: tournament.name,
        startsOn: tournament.startsOn,
        endsOn: tournament.endsOn,
      })),
      weeks,
      teams: snapshotTeams,
      matches: supported.map(({ match, bestOf }) => {
        const { status, result } = outcomeOf(match, bestOf);
        return {
          ref: match.ref,
          tournamentRef: match.tournamentRef,
          weekName: match.weekName,
          matchDay: match.matchDay,
          team1: match.team1,
          team2: match.team2,
          scheduledAt: match.scheduledAt,
          bestOf,
          status,
          result,
        };
      }),
    },
  };
}

function outcomeOf(
  match: ProviderMatch,
  bestOf: BestOf,
): { status: MatchStatus; result: MatchResult | null } {
  if (match.isNullified) return { status: 'nullified', result: null };
  if (match.winner === null) return { status: 'scheduled', result: null };
  const hasScore = bestOf !== 1 && match.team1Score !== null && match.team2Score !== null;
  return {
    status: 'completed',
    result: {
      winner: match.winner,
      score: hasScore ? { team1: match.team1Score, team2: match.team2Score } : null,
    },
  };
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [keyOf(item), item])).values()];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
