import type { ResultOverride } from '../../domain/scoring/match-outcome.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';

export interface ResultOverrideRepository {
  findForMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<Map<MatchId, ResultOverride>>;
  set(guildId: GuildId, matchId: MatchId, override: ResultOverride, setBy: UserId, at: Date): Promise<void>;
  /** Goes back to the data provider's result. */
  clear(guildId: GuildId, matchId: MatchId): Promise<void>;
}
