import type { Prediction } from '../../domain/prediction/prediction.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';

export interface PredictionRepository {
  /** Creates or replaces the user's prediction on that match. */
  save(prediction: Prediction): Promise<void>;
  findByUser(guildId: GuildId, userId: UserId, matchIds: readonly MatchId[]): Promise<Prediction[]>;
  /** Every prediction of the server on these matches (only read once votes are closed). */
  findByMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<Prediction[]>;
}
