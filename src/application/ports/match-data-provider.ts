import type { CompetitionSource } from '../../domain/competition/competition.js';
import type { Side } from '../../domain/match/series-score.js';

export interface ProviderTournament {
  /** Stable provider key of the tournament (Leaguepedia OverviewPage). */
  readonly ref: string;
  readonly name: string;
  readonly year: string;
  readonly split: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
}

export interface ProviderMatch {
  /** Stable provider key of the match (Leaguepedia MatchId). */
  readonly ref: string;
  readonly tournamentRef: string;
  readonly weekName: string;
  readonly weekOrder: number;
  readonly matchDay: number | null;
  /** Null while the opponent is still to be determined. */
  readonly team1: string | null;
  readonly team2: string | null;
  readonly scheduledAt: Date;
  readonly bestOf: number;
  readonly team1Score: number | null;
  readonly team2Score: number | null;
  readonly winner: Side | null;
  readonly isNullified: boolean;
}

export interface ProviderTeam {
  readonly name: string;
  readonly shortName: string;
  readonly logoUrl: string | null;
}

/** Source of esports calendars and results (Leaguepedia today, swappable). */
export interface MatchDataProvider {
  /** Tournaments of a competition still running or ending after `endingAfter`. */
  fetchTournaments(source: CompetitionSource, endingAfter: Date): Promise<ProviderTournament[]>;
  fetchMatches(tournamentRefs: readonly string[]): Promise<ProviderMatch[]>;
  fetchTeams(names: readonly string[]): Promise<ProviderTeam[]>;
}
