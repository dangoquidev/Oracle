import { and, eq, inArray } from 'drizzle-orm';
import type { LockOverrideRepository } from '../../application/ports/lock-override-repository.js';
import type { LockOverride } from '../../domain/lock/lock-override.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { lockOverrides } from '../db/schema.js';
import { excludedColumns } from './sql-helpers.js';

export class DrizzleLockOverrideRepository implements LockOverrideRepository {
  constructor(private readonly db: Database) {}

  async findForMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<Map<MatchId, LockOverride>> {
    if (matchIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(lockOverrides)
      .where(and(eq(lockOverrides.guildId, guildId), inArray(lockOverrides.matchId, [...matchIds])));
    return new Map(rows.map((row) => [row.matchId, { state: row.state, at: row.setAt }]));
  }

  async set(
    guildId: GuildId,
    matchIds: readonly MatchId[],
    override: LockOverride,
    setBy: UserId,
  ): Promise<void> {
    if (matchIds.length === 0) return;
    await this.db
      .insert(lockOverrides)
      .values(
        matchIds.map((matchId) => ({ guildId, matchId, state: override.state, setBy, setAt: override.at })),
      )
      .onConflictDoUpdate({
        target: [lockOverrides.guildId, lockOverrides.matchId],
        set: excludedColumns(lockOverrides, ['state', 'setBy', 'setAt']),
      });
  }
}
