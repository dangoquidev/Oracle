import type { BestOf } from '../../domain/match/best-of.js';
import type { MatchResult, MatchStatus } from '../../domain/match/match.js';
import type { PredictionWeek } from '../../domain/schedule/prediction-week.js';
import type { MatchId, TeamId, WeekId } from '../../domain/shared/ids.js';

export interface TeamView {
  readonly id: TeamId;
  readonly name: string;
  readonly shortName: string;
  /** Custom emoji showing the team logo, when one has been uploaded. */
  readonly emojiId: string | null;
}

export interface MatchView {
  readonly id: MatchId;
  readonly weekId: WeekId;
  readonly matchDay: number | null;
  readonly scheduledAt: Date;
  readonly bestOf: BestOf;
  readonly status: MatchStatus;
  /** Result published by the data provider (admin corrections are applied separately). */
  readonly result: MatchResult | null;
  readonly team1: TeamView | null;
  readonly team2: TeamView | null;
}

export interface WeekView {
  readonly week: PredictionWeek;
  readonly competitionName: string;
  /** Ordered by scheduled time. */
  readonly matches: readonly MatchView[];
}
