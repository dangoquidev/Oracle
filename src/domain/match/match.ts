import type { CompetitionId, MatchId, TeamId, WeekId } from '../shared/ids.js';
import type { BestOf } from './best-of.js';
import type { SeriesScore, Side } from './series-score.js';

export type MatchStatus = 'scheduled' | 'completed' | 'nullified';

export interface MatchResult {
  readonly winner: Side;
  /** Absent for Bo1 or when only the winner is known (e.g. forfeit). */
  readonly score: SeriesScore | null;
}

export interface Match {
  readonly id: MatchId;
  readonly competitionId: CompetitionId;
  readonly weekId: WeekId;
  /** Day number within the week, as published by the data provider. */
  readonly matchDay: number | null;
  readonly team1Id: TeamId | null;
  readonly team2Id: TeamId | null;
  readonly scheduledAt: Date;
  readonly bestOf: BestOf;
  readonly status: MatchStatus;
  readonly result: MatchResult | null;
}

/** A match is open to predictions once both opponents are known and it has not been played. */
export function hasKnownOpponents(match: Pick<Match, 'team1Id' | 'team2Id'>): boolean {
  return match.team1Id !== null && match.team2Id !== null;
}
