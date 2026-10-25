import { and, eq, inArray } from 'drizzle-orm';
import type { DispatchLog } from '../../application/ports/dispatch-log.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { dispatchLog } from '../db/schema.js';

export class DrizzleDispatchLog implements DispatchLog {
  constructor(private readonly db: Database) {}

  async findSent(guildId: GuildId, keys: readonly string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.db
      .select({ key: dispatchLog.key })
      .from(dispatchLog)
      .where(and(eq(dispatchLog.guildId, guildId), inArray(dispatchLog.key, [...keys])));
    return new Set(rows.map((row) => row.key));
  }

  async record(guildId: GuildId, key: string, at: Date): Promise<void> {
    await this.db.insert(dispatchLog).values({ guildId, key, dispatchedAt: at }).onConflictDoNothing();
  }
}
