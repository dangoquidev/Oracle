import type { GuildId, UserId } from '../shared/ids.js';

/**
 * A player excluded from a server's game: they can no longer predict and disappear from the
 * leaderboards and recaps. Their predictions are kept, so lifting the ban restores everything.
 */
export interface PlayerBan {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly bannedBy: UserId;
  readonly reason: string | null;
  readonly bannedAt: Date;
}

export const MAX_BAN_REASON_LENGTH = 200;
