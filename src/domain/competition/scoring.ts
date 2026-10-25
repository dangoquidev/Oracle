export interface ScoringRules {
  /** Points for predicting the right winner. */
  readonly correctWinner: number;
  /** Extra points for predicting the exact series score (Bo3/Bo5 only). */
  readonly exactScoreBonus: number;
}

export const DEFAULT_SCORING: ScoringRules = { correctWinner: 1, exactScoreBonus: 2 };
