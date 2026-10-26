import type { Locale } from '../../domain/guild/guild-settings.js';
import type { WeekOffset } from '../../domain/schedule/week-navigation.js';
import type { CompetitionId, GuildId, UserId } from '../../domain/shared/ids.js';
import { ok, type Result } from '../../domain/shared/result.js';
import type { JudgedPrediction, PredictionRepository } from '../ports/prediction-repository.js';
import type { WeekView } from '../read-models/views.js';
import type { ListWeekMatches, ListWeekMatchesError, WeekMatchesItem } from './list-week-matches.js';

export interface MyPredictionItem extends WeekMatchesItem {
  readonly prediction: JudgedPrediction | null;
}

export interface WeekTotals {
  /** Matches the player predicted. */
  readonly picked: number;
  /** Predictions already judged (cancelled matches excluded). */
  readonly judged: number;
  readonly points: number;
  readonly correctWinners: number;
  readonly exactScores: number;
}

export interface MyPredictionsWeek {
  readonly week: WeekView;
  readonly items: readonly MyPredictionItem[];
  readonly totals: WeekTotals;
}

export interface MyPredictions {
  readonly locale: Locale;
  readonly timeZone: string;
  readonly weeks: readonly MyPredictionsWeek[];
}

/** A player's picks, results and points over the current (or previous/next) week of each competition. */
export class GetMyPredictions {
  constructor(
    private readonly weekMatches: ListWeekMatches,
    private readonly predictions: PredictionRepository,
  ) {}

  async execute(
    guildId: GuildId,
    userId: UserId,
    offset: WeekOffset,
    competitionId: CompetitionId | null,
  ): Promise<Result<MyPredictions, ListWeekMatchesError>> {
    const listed = await this.weekMatches.execute(guildId, offset, competitionId);
    if (!listed.ok) return listed;

    const matchIds = listed.value.weeks.flatMap(({ items }) => items.map((item) => item.match.id));
    const own = new Map(
      (await this.predictions.findByUser(guildId, userId, matchIds)).map((prediction) => [
        prediction.matchId,
        prediction,
      ]),
    );
    return ok({
      locale: listed.value.locale,
      timeZone: listed.value.timeZone,
      weeks: listed.value.weeks.map(({ week, items }) => {
        const withPicks = items.map((item) => ({ ...item, prediction: own.get(item.match.id) ?? null }));
        return { week, items: withPicks, totals: totalsOf(withPicks) };
      }),
    });
  }
}

function totalsOf(items: readonly MyPredictionItem[]): WeekTotals {
  const totals = { picked: 0, judged: 0, points: 0, correctWinners: 0, exactScores: 0 };
  for (const { prediction } of items) {
    if (!prediction) continue;
    totals.picked += 1;
    const { outcome } = prediction;
    if (outcome.status !== 'scored') continue;
    totals.judged += 1;
    totals.points += outcome.points;
    if (outcome.correctWinner) totals.correctWinners += 1;
    if (outcome.exactScore) totals.exactScores += 1;
  }
  return totals;
}
