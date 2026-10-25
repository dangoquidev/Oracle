import type { Competition } from '../../domain/competition/competition.js';
import { accessOf } from '../../domain/guild/guild.js';
import type { Locale } from '../../domain/guild/guild-settings.js';
import type { VoteDistribution } from '../../domain/prediction/vote-distribution.js';
import { pickWeek, type WeekOffset } from '../../domain/schedule/week-navigation.js';
import type { CompetitionId, GuildId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import { areVotesVisible, predictionStateOf, type MatchPredictionState } from '../read-models/match-state.js';
import { loadDistributions } from '../read-models/vote-distributions.js';
import type { MatchView, WeekView } from '../read-models/views.js';
import type { LockCalculatorFactory } from './lock-calculator.js';

const SEARCH_WINDOW_MS = 180 * 86_400_000;

export interface WeekMatchesItem {
  readonly match: MatchView;
  readonly lockAt: Date;
  readonly state: MatchPredictionState;
  readonly distribution: VoteDistribution | null;
}

export interface WeekMatches {
  readonly week: WeekView;
  readonly items: readonly WeekMatchesItem[];
}

export interface WeekMatchesResult {
  readonly locale: Locale;
  readonly timeZone: string;
  readonly weeks: readonly WeekMatches[];
}

export type ListWeekMatchesError = 'guild-not-active' | 'competition-not-enabled';

/** The current (or previous/next) week of each enabled competition, with vote state per match. */
export class ListWeekMatches {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly predictions: PredictionRepository,
    private readonly locks: LockCalculatorFactory,
    private readonly competitions: readonly Competition[],
    private readonly clock: Clock,
  ) {}

  async execute(
    guildId: GuildId,
    offset: WeekOffset,
    competitionId: CompetitionId | null,
  ): Promise<Result<WeekMatchesResult, ListWeekMatchesError>> {
    const guild = await this.guilds.find(guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return err('guild-not-active');
    const { settings } = guild;
    if (competitionId !== null && !settings.competitionIds.includes(competitionId)) {
      return err('competition-not-enabled');
    }

    const now = this.clock.now();
    const competitionIds = competitionId === null ? settings.competitionIds : [competitionId];
    const ordered = this.competitions.filter((competition) => competitionIds.includes(competition.id));
    const locks = this.locks.forGuild(guildId, settings);

    const weeks: WeekMatches[] = [];
    for (const competition of ordered) {
      const candidates = await this.calendar.findWeeksBetween(
        [competition.id],
        new Date(now.getTime() - SEARCH_WINDOW_MS),
        new Date(now.getTime() + SEARCH_WINDOW_MS),
      );
      const picked = pickWeek(candidates, now, offset);
      if (!picked) continue;
      const [view] = await this.calendar.findWeekViews([picked.id]);
      if (!view) continue;

      const rows: Omit<WeekMatchesItem, 'distribution'>[] = [];
      for (const match of view.matches) {
        const lockAt = await locks.lockAtOf(match);
        rows.push({ match, lockAt, state: predictionStateOf(match, lockAt, now) });
      }
      const distributions = await loadDistributions(
        this.predictions,
        guildId,
        rows.filter((row) => areVotesVisible(row.state)).map((row) => row.match),
      );
      weeks.push({
        week: view,
        items: rows.map((row) => ({ ...row, distribution: distributions.get(row.match.id) ?? null })),
      });
    }

    return ok({ locale: settings.locale, timeZone: settings.timeZone, weeks });
  }
}
