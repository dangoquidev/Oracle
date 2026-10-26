import { and, eq } from 'drizzle-orm';
import type { BanRepository } from '../../application/ports/ban-repository.js';
import type { PlayerBan } from '../../domain/guild/player-ban.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { playerBans } from '../db/schema.js';

export class DrizzleBanRepository implements BanRepository {
  constructor(private readonly db: Database) {}

  async ban(ban: PlayerBan): Promise<boolean> {
    const inserted = await this.db
      .insert(playerBans)
      .values(ban)
      .onConflictDoNothing()
      .returning({ userId: playerBans.userId });
    return inserted.length > 0;
  }

  async unban(guildId: GuildId, userId: UserId): Promise<boolean> {
    const deleted = await this.db
      .delete(playerBans)
      .where(and(eq(playerBans.guildId, guildId), eq(playerBans.userId, userId)))
      .returning({ userId: playerBans.userId });
    return deleted.length > 0;
  }

  async isBanned(guildId: GuildId, userId: UserId): Promise<boolean> {
    const rows = await this.db
      .select({ userId: playerBans.userId })
      .from(playerBans)
      .where(and(eq(playerBans.guildId, guildId), eq(playerBans.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async bannedIds(guildId: GuildId): Promise<ReadonlySet<UserId>> {
    const rows = await this.db
      .select({ userId: playerBans.userId })
      .from(playerBans)
      .where(eq(playerBans.guildId, guildId));
    return new Set(rows.map((row) => row.userId));
  }
}
