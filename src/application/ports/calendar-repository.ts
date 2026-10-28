import type { BestOf } from '../../domain/match/best-of.js';
import type { Match, MatchResult, MatchStatus } from '../../domain/match/match.js';
import type { SeasonPeriod } from '../../domain/competition/season.js';
import type { PredictionWeek } from '../../domain/schedule/prediction-week.js';
import type { CompetitionId, MatchId, TeamId, WeekId } from '../../domain/shared/ids.js';
import type { WeekView } from '../read-models/views.js';

/** Normalised calendar of one competition, as obtained from the data provider. */
export interface CalendarSnapshot {
  readonly competitionId: CompetitionId;
  readonly seasons: readonly { readonly key: string; readonly name: string }[];
  readonly tournaments: readonly {
    readonly ref: string;
    readonly seasonKey: string;
    readonly name: string;
    readonly startsOn: string | null;
    readonly endsOn: string | null;
  }[];
  readonly weeks: readonly {
    readonly tournamentRef: string;
    readonly name: string;
    readonly order: number;
  }[];
  readonly teams: readonly {
    readonly name: string;
    readonly shortName: string;
    readonly logoUrl: string | null;
  }[];
  readonly matches: readonly {
    readonly ref: string;
    readonly tournamentRef: string;
    readonly weekName: string;
    readonly matchDay: number | null;
    readonly team1: string | null;
    readonly team2: string | null;
    readonly scheduledAt: Date;
    readonly bestOf: BestOf;
    readonly status: MatchStatus;
    readonly result: MatchResult | null;
  }[];
}

export interface TeamMissingEmoji {
  readonly id: TeamId;
  readonly shortName: string;
  /** Null when the provider has no logo: only an emoji added by hand can fill the gap. */
  readonly logoUrl: string | null;
}

/** A season that has at least one scheduled match. */
export interface SeasonSummary extends SeasonPeriod {
  readonly weekIds: readonly WeekId[];
}

export interface CalendarRepository {
  /**
   * Upserts the whole snapshot atomically; provider keys identify existing rows.
   * Matches may reference cached teams that are not part of the snapshot.
   */
  applySnapshot(snapshot: CalendarSnapshot): Promise<void>;
  /** Weeks of the given competitions with matches inside [from, to). */
  findWeeksBetween(competitionIds: readonly CompetitionId[], from: Date, to: Date): Promise<PredictionWeek[]>;
  findWeekViews(weekIds: readonly WeekId[]): Promise<WeekView[]>;
  findMatch(matchId: MatchId): Promise<Match | null>;
  findMatches(matchIds: readonly MatchId[]): Promise<Match[]>;
  findWeekMatches(weekId: WeekId): Promise<Match[]>;
  /** Matches whose scheduled start falls inside [from, to]. */
  findMatchesStartedBetween(from: Date, to: Date): Promise<Match[]>;
  /** Competitions with a match started in [from, to] whose result is still unknown. */
  findCompetitionsAwaitingResults(from: Date, to: Date): Promise<CompetitionId[]>;
  /** Which of these provider team names are already cached. */
  findKnownTeamNames(names: readonly string[]): Promise<Set<string>>;
  /** Teams of recent or upcoming matches without an emoji yet (with or without a logo). */
  findTeamsMissingEmoji(upcomingFrom: Date, limit: number): Promise<TeamMissingEmoji[]>;
  setTeamEmoji(teamId: TeamId, emojiId: string): Promise<void>;
  /** Seasons of these competitions, oldest first. */
  findSeasons(competitionIds: readonly CompetitionId[]): Promise<SeasonSummary[]>;
}
