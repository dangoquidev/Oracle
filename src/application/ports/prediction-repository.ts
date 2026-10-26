import type { Prediction } from '../../domain/prediction/prediction.js';
import type { PredictionOutcome } from '../../domain/scoring/score-prediction.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';

/** A prediction together with how it was judged so far. */
export interface JudgedPrediction extends Prediction {
  readonly outcome: PredictionOutcome;
}

export interface PredictionRepository {
  /** Creates or replaces the user's prediction on that match (and resets its judgement). */
  save(prediction: Prediction): Promise<void>;
  findByUser(guildId: GuildId, userId: UserId, matchIds: readonly MatchId[]): Promise<JudgedPrediction[]>;
  /** Every prediction of the server on these matches (only read once votes are closed). */
  findByMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<JudgedPrediction[]>;
  /** Predictions to judge on these matches, for one server or all of them. */
  findForScoring(matchIds: readonly MatchId[], guildId: GuildId | null): Promise<JudgedPrediction[]>;
  saveOutcomes(
    judged: readonly Pick<JudgedPrediction, 'guildId' | 'userId' | 'matchId' | 'outcome'>[],
    at: Date,
  ): Promise<void>;
}
