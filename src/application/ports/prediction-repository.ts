import type { Prediction } from '../../domain/prediction/prediction.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';

export interface PredictionRepository {
  /** Creates or replaces the user's prediction on that match. */
  save(prediction: Prediction): Promise<void>;
  findByUser(guildId: GuildId, userId: UserId, matchIds: readonly MatchId[]): Promise<Prediction[]>;
}
