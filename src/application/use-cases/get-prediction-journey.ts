import { accessOf } from '../../domain/guild/guild.js';
import type { Locale } from '../../domain/guild/guild-settings.js';
import { isLockedAt } from '../../domain/lock/lock-policy.js';
import { hasKnownOpponents } from '../../domain/match/match.js';
import { choicesFor, type PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import type { PublicationId, PublicationRepository } from '../ports/publication-repository.js';
import type { MatchView } from '../read-models/views.js';
import { LockCalculator } from './lock-calculator.js';

export type JourneyItemState = 'open' | 'locked' | 'awaiting-opponents' | 'closed';

export interface JourneyItem {
  readonly match: MatchView;
  readonly competitionName: string;
  readonly weekName: string;
  readonly lockAt: Date;
  readonly state: JourneyItemState;
  readonly choices: readonly PredictionChoice[];
  readonly current: PredictionChoice | null;
}

export interface PredictionJourney {
  readonly publicationId: PublicationId;
  readonly locale: Locale;
  readonly timeZone: string;
  readonly items: readonly JourneyItem[];
}

export type PredictionJourneyError = 'guild-not-active' | 'publication-not-found';

/** Everything a user needs to go through a published week match by match. */
export class GetPredictionJourney {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly publications: PublicationRepository,
    private readonly calendar: CalendarRepository,
    private readonly predictions: PredictionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    guildId: GuildId,
    userId: UserId,
    publicationId: PublicationId,
  ): Promise<Result<PredictionJourney, PredictionJourneyError>> {
    const guild = await this.guilds.find(guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return err('guild-not-active');

    const publication = await this.publications.find(publicationId);
    if (publication?.guildId !== guildId) return err('publication-not-found');

    const weeks = await this.calendar.findWeekViews(publication.weekIds);
    const matchIds = weeks.flatMap((week) => week.matches.map((match) => match.id));
    const existing = await this.predictions.findByUser(guildId, userId, matchIds);
    const currentByMatch = new Map(existing.map((prediction) => [prediction.matchId, prediction.choice]));

    const locks = new LockCalculator(this.calendar, guild.settings);
    const now = this.clock.now();
    const items: JourneyItem[] = [];
    for (const week of weeks) {
      for (const match of week.matches) {
        const lockAt = await locks.lockAtOf(match);
        items.push({
          match,
          competitionName: week.competitionName,
          weekName: week.week.name,
          lockAt,
          state: stateOf(match, lockAt, now),
          choices: choicesFor(match.bestOf),
          current: currentByMatch.get(match.id) ?? null,
        });
      }
    }

    return ok({ publicationId, locale: guild.settings.locale, timeZone: guild.settings.timeZone, items });
  }
}

function stateOf(match: MatchView, lockAt: Date, now: Date): JourneyItemState {
  if (match.status !== 'scheduled') return 'closed';
  if (!hasKnownOpponents({ team1Id: match.team1?.id ?? null, team2Id: match.team2?.id ?? null })) {
    return 'awaiting-opponents';
  }
  return isLockedAt(lockAt, now) ? 'locked' : 'open';
}
