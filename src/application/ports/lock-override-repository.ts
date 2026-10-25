import type { LockOverride } from '../../domain/lock/lock-override.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';

export interface LockOverrideRepository {
  findForMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<Map<MatchId, LockOverride>>;
  /** Replaces the override of each match. */
  set(guildId: GuildId, matchIds: readonly MatchId[], override: LockOverride, setBy: UserId): Promise<void>;
}
