import { and, eq, inArray } from 'drizzle-orm';
import type { ResultOverrideRepository } from '../../application/ports/result-override-repository.js';
import type { Side } from '../../domain/match/series-score.js';
import type { ResultOverride } from '../../domain/scoring/match-outcome.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { resultOverrides } from '../db/schema.js';
import { excludedColumns } from './sql-helpers.js';

type OverrideRow = typeof resultOverrides.$inferSelect;

export class DrizzleResultOverrideRepository implements ResultOverrideRepository {
  constructor(private readonly db: Database) {}

  async findForMatches(
    guildId: GuildId,
    matchIds: readonly MatchId[],
  ): Promise<Map<MatchId, ResultOverride>> {
    if (matchIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(resultOverrides)
      .where(and(eq(resultOverrides.guildId, guildId), inArray(resultOverrides.matchId, [...matchIds])));
    return new Map(
      rows.flatMap((row) => {
        const override = toOverride(row);
        return override ? [[row.matchId, override] as const] : [];
      }),
    );
  }

  async set(
    guildId: GuildId,
    matchId: MatchId,
    override: ResultOverride,
    setBy: UserId,
    at: Date,
  ): Promise<void> {
    const result = override.kind === 'result' ? override.result : null;
    await this.db
      .insert(resultOverrides)
      .values({
        guildId,
        matchId,
        cancelled: override.kind === 'cancelled',
        winnerSide: result?.winner ?? null,
        team1Score: result?.score?.team1 ?? null,
        team2Score: result?.score?.team2 ?? null,
        setBy,
        setAt: at,
      })
      .onConflictDoUpdate({
        target: [resultOverrides.guildId, resultOverrides.matchId],
        set: excludedColumns(resultOverrides, [
          'cancelled',
          'winnerSide',
          'team1Score',
          'team2Score',
          'setBy',
          'setAt',
        ]),
      });
  }

  async clear(guildId: GuildId, matchId: MatchId): Promise<void> {
    await this.db
      .delete(resultOverrides)
      .where(and(eq(resultOverrides.guildId, guildId), eq(resultOverrides.matchId, matchId)));
  }
}

function toOverride(row: OverrideRow): ResultOverride | null {
  if (row.cancelled) return { kind: 'cancelled' };
  if (row.winnerSide === null) return null;
  const score =
    row.team1Score !== null && row.team2Score !== null
      ? { team1: row.team1Score, team2: row.team2Score }
      : null;
  return { kind: 'result', result: { winner: row.winnerSide as Side, score } };
}
