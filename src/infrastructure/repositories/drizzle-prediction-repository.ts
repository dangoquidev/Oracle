import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  JudgedPrediction,
  PredictionRepository,
} from '../../application/ports/prediction-repository.js';
import type { Side } from '../../domain/match/series-score.js';
import type { Prediction } from '../../domain/prediction/prediction.js';
import { predictedWinner, type PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import type { PredictionOutcome } from '../../domain/scoring/score-prediction.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { predictions } from '../db/schema.js';
import { chunk } from '../support/chunk.js';

type PredictionRow = typeof predictions.$inferSelect;

const UPDATE_BATCH = 200;

export class DrizzlePredictionRepository implements PredictionRepository {
  constructor(private readonly db: Database) {}

  async save(prediction: Prediction): Promise<void> {
    const score = prediction.choice.kind === 'score' ? prediction.choice.score : null;
    const vote = {
      winnerSide: predictedWinner(prediction.choice),
      scoreTeam1: score?.team1 ?? null,
      scoreTeam2: score?.team2 ?? null,
      submittedAt: prediction.submittedAt,
    };
    // A new pick is judged afresh by the next scoring run.
    const reset = {
      outcome: 'pending' as const,
      points: null,
      correctWinner: null,
      exactScore: null,
      scoredAt: null,
    };
    await this.db
      .insert(predictions)
      .values({
        guildId: prediction.guildId,
        userId: prediction.userId,
        matchId: prediction.matchId,
        ...vote,
      })
      .onConflictDoUpdate({
        target: [predictions.guildId, predictions.userId, predictions.matchId],
        set: { ...vote, ...reset },
      });
  }

  async findByUser(
    guildId: GuildId,
    userId: UserId,
    matchIds: readonly MatchId[],
  ): Promise<JudgedPrediction[]> {
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
    return rows.map(toJudgedPrediction);
  }

  async findScoredByUser(guildId: GuildId, userId: UserId): Promise<JudgedPrediction[]> {
    const rows = await this.db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.guildId, guildId),
          eq(predictions.userId, userId),
          eq(predictions.outcome, 'scored'),
        ),
      );
    return rows.map(toJudgedPrediction);
  }

  async findByMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<JudgedPrediction[]> {
    if (matchIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(predictions)
      .where(and(eq(predictions.guildId, guildId), inArray(predictions.matchId, [...matchIds])));
    return rows.map(toJudgedPrediction);
  }

  async findForScoring(matchIds: readonly MatchId[], guildId: GuildId | null): Promise<JudgedPrediction[]> {
    if (matchIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(predictions)
      .where(
        and(
          inArray(predictions.matchId, [...matchIds]),
          guildId === null ? undefined : eq(predictions.guildId, guildId),
        ),
      );
    return rows.map(toJudgedPrediction);
  }

  async saveOutcomes(
    judged: readonly Pick<JudgedPrediction, 'guildId' | 'userId' | 'matchId' | 'outcome'>[],
    at: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const batch of chunk(judged, UPDATE_BATCH)) {
        for (const prediction of batch) {
          const scored = prediction.outcome.status === 'scored' ? prediction.outcome : null;
          await tx
            .update(predictions)
            .set({
              outcome: prediction.outcome.status,
              points: scored?.points ?? null,
              correctWinner: scored?.correctWinner ?? null,
              exactScore: scored?.exactScore ?? null,
              scoredAt: prediction.outcome.status === 'pending' ? null : at,
            })
            .where(
              and(
                eq(predictions.guildId, prediction.guildId),
                eq(predictions.userId, prediction.userId),
                eq(predictions.matchId, prediction.matchId),
                // Never overwrite a pick changed after it was read for scoring.
                sql`${predictions.submittedAt} <= ${at}`,
              ),
            );
        }
      }
    });
  }
}

function toJudgedPrediction(row: PredictionRow): JudgedPrediction {
  return {
    guildId: row.guildId,
    userId: row.userId,
    matchId: row.matchId,
    choice: toChoice(row),
    submittedAt: row.submittedAt,
    outcome: toOutcome(row),
  };
}

function toChoice(row: PredictionRow): PredictionChoice {
  if (row.scoreTeam1 !== null && row.scoreTeam2 !== null) {
    return { kind: 'score', score: { team1: row.scoreTeam1, team2: row.scoreTeam2 } };
  }
  return { kind: 'winner', winner: row.winnerSide as Side };
}

function toOutcome(row: PredictionRow): PredictionOutcome {
  if (row.outcome === 'scored') {
    return {
      status: 'scored',
      points: row.points ?? 0,
      correctWinner: row.correctWinner ?? false,
      exactScore: row.exactScore ?? false,
    };
  }
  return { status: row.outcome };
}
