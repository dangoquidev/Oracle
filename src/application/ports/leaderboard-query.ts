import type { PlayerTally } from '../../domain/leaderboard/leaderboard.js';
import type { CompetitionId, GuildId, MatchId, SeasonId, WeekId } from '../../domain/shared/ids.js';

/** Restricts the judged predictions summed up; every given criterion applies. */
export interface TallyFilter {
  readonly competitionIds?: readonly CompetitionId[];
  readonly seasonIds?: readonly SeasonId[];
  readonly weekIds?: readonly WeekId[];
  readonly matchIds?: readonly MatchId[];
}

export interface LeaderboardQuery {
  /** Points of every player of the server with at least one judged prediction in scope. */
  tally(guildId: GuildId, filter: TallyFilter): Promise<PlayerTally[]>;
}
