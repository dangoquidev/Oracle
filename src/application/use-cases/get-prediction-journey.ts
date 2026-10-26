import { accessOf } from '../../domain/guild/guild.js';
import type { Locale } from '../../domain/guild/guild-settings.js';
import { choicesFor, type PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import type { VoteDistribution } from '../../domain/prediction/vote-distribution.js';
import type { MatchOutcome } from '../../domain/scoring/match-outcome.js';
import type { PredictionOutcome } from '../../domain/scoring/score-prediction.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { BanRepository } from '../ports/ban-repository.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import type { PublicationId, PublicationRepository } from '../ports/publication-repository.js';
import type { ResultOverrideRepository } from '../ports/result-override-repository.js';
import { areVotesVisible, standingOf, type MatchPredictionState } from '../read-models/match-state.js';
import { scopeWeeks } from '../read-models/publication-scope.js';
import { loadDistributions } from '../read-models/vote-distributions.js';
import type { MatchView } from '../read-models/views.js';
import type { LockCalculatorFactory } from './lock-calculator.js';

export type JourneyItemState = MatchPredictionState;

export interface JourneyItem {
  readonly match: MatchView;
  readonly competitionName: string;
  readonly weekName: string;
  readonly lockAt: Date;
  readonly state: JourneyItemState;
  readonly choices: readonly PredictionChoice[];
  readonly current: PredictionChoice | null;
  /** Result the match is judged on (admin corrections applied). */
  readonly outcome: MatchOutcome;
  /** How the user's pick was judged, when they made one. */
  readonly judgement: PredictionOutcome | null;
  /** How the server voted, once votes are closed. */
  readonly distribution: VoteDistribution | null;
}

export interface PredictionJourney {
  readonly publicationId: PublicationId;
  readonly locale: Locale;
  readonly timeZone: string;
  readonly items: readonly JourneyItem[];
}

export type PredictionJourneyError = 'guild-not-active' | 'banned' | 'publication-not-found';

/** Everything a user needs to go through a published week match by match. */
export class GetPredictionJourney {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly publications: PublicationRepository,
    private readonly calendar: CalendarRepository,
    private readonly predictions: PredictionRepository,
    private readonly resultOverrides: ResultOverrideRepository,
    private readonly locks: LockCalculatorFactory,
    private readonly clock: Clock,
    private readonly bans: BanRepository,
  ) {}

  async execute(
    guildId: GuildId,
    userId: UserId,
    publicationId: PublicationId,
  ): Promise<Result<PredictionJourney, PredictionJourneyError>> {
    const guild = await this.guilds.find(guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return err('guild-not-active');
    if (await this.bans.isBanned(guildId, userId)) return err('banned');

    const publication = await this.publications.find(publicationId);
    if (publication?.guildId !== guildId) return err('publication-not-found');

    const weeks = scopeWeeks(
      await this.calendar.findWeekViews(publication.weekIds),
      publication.day,
      guild.settings.timeZone,
    );
    const matchIds = weeks.flatMap((week) => week.matches.map((match) => match.id));
    const existing = await this.predictions.findByUser(guildId, userId, matchIds);
    const existingByMatch = new Map(existing.map((prediction) => [prediction.matchId, prediction]));
    const overrides = await this.resultOverrides.findForMatches(guildId, matchIds);

    const locks = this.locks.forGuild(guildId, guild.settings);
    const now = this.clock.now();
    const rows: Omit<JourneyItem, 'distribution'>[] = [];
    for (const week of weeks) {
      for (const match of week.matches) {
        const lockAt = await locks.lockAtOf(match);
        const prediction = existingByMatch.get(match.id);
        rows.push({
          match,
          competitionName: week.competitionName,
          weekName: week.week.name,
          lockAt,
          ...standingOf(match, lockAt, now, overrides.get(match.id) ?? null),
          choices: choicesFor(match.bestOf),
          current: prediction?.choice ?? null,
          judgement: prediction?.outcome ?? null,
        });
      }
    }

    const distributions = await loadDistributions(
      this.predictions,
      guildId,
      rows.filter((row) => areVotesVisible(row.state)).map((row) => row.match),
    );
    const items = rows.map((row) => ({ ...row, distribution: distributions.get(row.match.id) ?? null }));
    return ok({ publicationId, locale: guild.settings.locale, timeZone: guild.settings.timeZone, items });
  }
}
