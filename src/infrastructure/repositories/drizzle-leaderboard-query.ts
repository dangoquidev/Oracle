import { and, eq, inArray, sql, sum } from 'drizzle-orm';
import type { LeaderboardQuery, TallyFilter } from '../../application/ports/leaderboard-query.js';
import type { PlayerTally } from '../../domain/leaderboard/leaderboard.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { matches, predictions, tournaments } from '../db/schema.js';

/** Standings are aggregated on read from judged predictions: nothing to keep in sync. */
export class DrizzleLeaderboardQuery implements LeaderboardQuery {
  constructor(private readonly db: Database) {}

  async tally(guildId: GuildId, filter: TallyFilter): Promise<PlayerTally[]> {
    const { competitionIds, seasonIds, weekIds, matchIds } = filter;
    if ([competitionIds, seasonIds, weekIds, matchIds].some((ids) => ids?.length === 0)) return [];
    const rows = await this.db
      .select({
        userId: predictions.userId,
        points: sum(predictions.points).mapWith(Number),
        predictions: sql<number>`count(*)`.mapWith(Number),
        correctWinners: sql<number>`count(*) filter (where ${predictions.correctWinner})`.mapWith(Number),
        exactScores: sql<number>`count(*) filter (where ${predictions.exactScore})`.mapWith(Number),
      })
      .from(predictions)
      .innerJoin(matches, eq(matches.id, predictions.matchId))
      .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
      .where(
        and(
          eq(predictions.guildId, guildId),
          eq(predictions.outcome, 'scored'),
          competitionIds && inArray(matches.competitionId, [...competitionIds]),
          seasonIds && inArray(tournaments.seasonId, [...seasonIds]),
          weekIds && inArray(matches.weekId, [...weekIds]),
          matchIds && inArray(matches.id, [...matchIds]),
        ),
      )
      .groupBy(predictions.userId);
    return rows;
  }
}
