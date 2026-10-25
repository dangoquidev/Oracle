import type { Competition } from '../../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../../domain/competition/scoring.js';
import type { Match } from '../../domain/match/match.js';
import { outcomeOf } from '../../domain/scoring/match-outcome.js';
import { judgePrediction, sameOutcome } from '../../domain/scoring/score-prediction.js';
import type { GuildId, MatchId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { JudgedPrediction, PredictionRepository } from '../ports/prediction-repository.js';
import type { ResultOverrideRepository } from '../ports/result-override-repository.js';

const DEFAULT_LOOKBACK_MS = 30 * 86_400_000;

export interface ScoringScope {
  /** Only this server (all servers by default). */
  readonly guildId?: GuildId;
  /** Only these matches; otherwise every match started since `since`. */
  readonly matchIds?: readonly MatchId[];
  /** Defaults to 30 days ago. */
  readonly since?: Date;
}

/**
 * Judges predictions against match outcomes (provider result or admin correction).
 * Idempotent: it recomputes what each prediction should be worth and only writes differences,
 * so it can run after every sync, correction or on demand.
 */
export class ScorePredictions {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly predictions: PredictionRepository,
    private readonly resultOverrides: ResultOverrideRepository,
    private readonly competitions: readonly Competition[],
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Returns how many predictions changed. */
  async execute(scope: ScoringScope = {}): Promise<number> {
    const now = this.clock.now();
    const matches = scope.matchIds
      ? await this.calendar.findMatches(scope.matchIds)
      : await this.calendar.findMatchesStartedBetween(
          scope.since ?? new Date(now.getTime() - DEFAULT_LOOKBACK_MS),
          now,
        );
    if (matches.length === 0) return 0;

    const matchById = new Map(matches.map((match) => [match.id, match]));
    const predictions = await this.predictions.findForScoring([...matchById.keys()], scope.guildId ?? null);
    const changed: JudgedPrediction[] = [];
    for (const [guildId, guildPredictions] of groupByGuild(predictions)) {
      const overrides = await this.resultOverrides.findForMatches(guildId, [
        ...new Set(guildPredictions.map((prediction) => prediction.matchId)),
      ]);
      for (const prediction of guildPredictions) {
        const match = matchById.get(prediction.matchId);
        if (!match) continue;
        const outcome = judgePrediction(
          prediction.choice,
          outcomeOf(match, overrides.get(match.id) ?? null),
          this.scoringOf(match),
        );
        if (!sameOutcome(outcome, prediction.outcome)) changed.push({ ...prediction, outcome });
      }
    }

    if (changed.length > 0) {
      await this.predictions.saveOutcomes(changed, now);
      this.logger.info({ changed: changed.length, guildId: scope.guildId }, 'Predictions scored');
    }
    return changed.length;
  }

  private scoringOf(match: Match) {
    return (
      this.competitions.find((competition) => competition.id === match.competitionId)?.scoring ??
      DEFAULT_SCORING
    );
  }
}

function groupByGuild(predictions: readonly JudgedPrediction[]): Map<GuildId, JudgedPrediction[]> {
  const groups = new Map<GuildId, JudgedPrediction[]>();
  for (const prediction of predictions) {
    groups.set(prediction.guildId, [...(groups.get(prediction.guildId) ?? []), prediction]);
  }
  return groups;
}
