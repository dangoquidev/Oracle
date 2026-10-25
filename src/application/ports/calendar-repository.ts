import type { BestOf } from '../../domain/match/best-of.js';
import type { Match, MatchResult, MatchStatus } from '../../domain/match/match.js';
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
  readonly logoUrl: string;
}

export interface CalendarRepository {
  /** Upserts the whole snapshot atomically; provider keys identify existing rows. */
  applySnapshot(snapshot: CalendarSnapshot): Promise<void>;
  /** Weeks of the given competitions with matches inside [from, to). */
  findWeeksBetween(competitionIds: readonly CompetitionId[], from: Date, to: Date): Promise<PredictionWeek[]>;
  findWeekViews(weekIds: readonly WeekId[]): Promise<WeekView[]>;
  findMatch(matchId: MatchId): Promise<Match | null>;
  findWeekMatches(weekId: WeekId): Promise<Match[]>;
  /** Teams of upcoming matches that have a logo but no emoji yet. */
  findTeamsMissingEmoji(upcomingFrom: Date, limit: number): Promise<TeamMissingEmoji[]>;
  setTeamEmoji(teamId: TeamId, emojiId: string): Promise<void>;
}
