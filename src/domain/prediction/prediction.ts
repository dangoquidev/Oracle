import type { GuildId, MatchId, UserId } from '../shared/ids.js';
import type { PredictionChoice } from './prediction-choice.js';

export interface Prediction {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly matchId: MatchId;
  readonly choice: PredictionChoice;
  /** Time of the Discord interaction that produced this choice. */
  readonly submittedAt: Date;
}
