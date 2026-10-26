import type { PlayerBan } from '../../domain/guild/player-ban.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';

export interface BanRepository {
  /** Returns false when the player was already banned (the existing ban is kept). */
  ban(ban: PlayerBan): Promise<boolean>;
  /** Returns false when the player was not banned. */
  unban(guildId: GuildId, userId: UserId): Promise<boolean>;
  isBanned(guildId: GuildId, userId: UserId): Promise<boolean>;
  bannedIds(guildId: GuildId): Promise<ReadonlySet<UserId>>;
}
