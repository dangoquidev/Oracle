import { and, eq, inArray } from 'drizzle-orm';
import type { PredictionRepository } from '../../application/ports/prediction-repository.js';
import type { Prediction } from '../../domain/prediction/prediction.js';
import type { PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import { predictedWinner } from '../../domain/prediction/prediction-choice.js';
import type { Side } from '../../domain/match/series-score.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { predictions } from '../db/schema.js';
import { excludedColumns } from './sql-helpers.js';

type PredictionRow = typeof predictions.$inferSelect;

export class DrizzlePredictionRepository implements PredictionRepository {
  constructor(private readonly db: Database) {}

  async save(prediction: Prediction): Promise<void> {
    const score = prediction.choice.kind === 'score' ? prediction.choice.score : null;
    await this.db
      .insert(predictions)
      .values({
        guildId: prediction.guildId,
        userId: prediction.userId,
        matchId: prediction.matchId,
        winnerSide: predictedWinner(prediction.choice),
        scoreTeam1: score?.team1 ?? null,
        scoreTeam2: score?.team2 ?? null,
        submittedAt: prediction.submittedAt,
      })
      .onConflictDoUpdate({
        target: [predictions.guildId, predictions.userId, predictions.matchId],
        set: excludedColumns(predictions, ['winnerSide', 'scoreTeam1', 'scoreTeam2', 'submittedAt']),
      });
  }

  async findByUser(guildId: GuildId, userId: UserId, matchIds: readonly MatchId[]): Promise<Prediction[]> {
    if (matchIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.guildId, guildId),
          eq(predictions.userId, userId),
          inArray(predictions.matchId, [...matchIds]),
        ),
      );
    return rows.map(toPrediction);
  }

  async findByMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<Prediction[]> {
    if (matchIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(predictions)
      .where(and(eq(predictions.guildId, guildId), inArray(predictions.matchId, [...matchIds])));
    return rows.map(toPrediction);
  }
}

function toPrediction(row: PredictionRow): Prediction {
  return {
    guildId: row.guildId,
    userId: row.userId,
    matchId: row.matchId,
    choice: toChoice(row),
    submittedAt: row.submittedAt,
  };
}

function toChoice(row: PredictionRow): PredictionChoice {
  if (row.scoreTeam1 !== null && row.scoreTeam2 !== null) {
    return { kind: 'score', score: { team1: row.scoreTeam1, team2: row.scoreTeam2 } };
  }
  return { kind: 'winner', winner: row.winnerSide as Side };
}
