import type { Locale } from '../../domain/guild/guild-settings.js';
import type { CompetitionId, GuildId } from '../../domain/shared/ids.js';
import { ok, type Result } from '../../domain/shared/result.js';
import type { BanRepository } from '../ports/ban-repository.js';
import type { JudgedPrediction, PredictionRepository } from '../ports/prediction-repository.js';
import type { WeekView } from '../read-models/views.js';
import type { ListWeekMatches, ListWeekMatchesError, WeekMatchesItem } from './list-week-matches.js';

export interface RoundPredictionItem extends WeekMatchesItem {
  /** Every player's pick on the match (banned players left out). */
  readonly picks: readonly JudgedPrediction[];
}

export interface RoundPredictionsWeek {
  readonly week: WeekView;
  readonly items: readonly RoundPredictionItem[];
  /** Players with at least one pick in the week. */
  readonly players: number;
}

export interface RoundPredictions {
  readonly locale: Locale;
  readonly timeZone: string;
  readonly weeks: readonly RoundPredictionsWeek[];
}

/** /prono: who picked what on the current week (round) of each enabled competition. */
export class GetRoundPredictions {
  constructor(
    private readonly weekMatches: ListWeekMatches,
    private readonly predictions: PredictionRepository,
    private readonly bans: BanRepository,
  ) {}

  async execute(
    guildId: GuildId,
    competitionId: CompetitionId | null,
  ): Promise<Result<RoundPredictions, ListWeekMatchesError>> {
    const listed = await this.weekMatches.execute(guildId, 0, competitionId);
    if (!listed.ok) return listed;

    const matchIds = listed.value.weeks.flatMap(({ items }) => items.map((item) => item.match.id));
    const [all, banned] = await Promise.all([
      this.predictions.findByMatches(guildId, matchIds),
      this.bans.bannedIds(guildId),
    ]);
    const picks = all.filter((prediction) => !banned.has(prediction.userId));
    return ok({
      locale: listed.value.locale,
      timeZone: listed.value.timeZone,
      weeks: listed.value.weeks.map(({ week, items }) => {
        const withPicks = items.map((item) => ({
          ...item,
          picks: picks
            .filter((pick) => pick.matchId === item.match.id)
            .toSorted((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()),
        }));
        const players = new Set(withPicks.flatMap((item) => item.picks.map((pick) => pick.userId)));
        return { week, items: withPicks, players: players.size };
      }),
    });
  }
}
