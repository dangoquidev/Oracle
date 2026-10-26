import type { Competition } from '../../domain/competition/competition.js';
import type { CompetitionId, SeasonId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';

export interface SeasonChoice {
  readonly id: SeasonId;
  readonly competitionName: string;
  readonly name: string;
}

/** Seasons already started, newest first: past splits and tournaments keep their leaderboard. */
export class ListSeasons {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly competitions: readonly Competition[],
    private readonly clock: Clock,
  ) {}

  async execute(competitionId: CompetitionId | null): Promise<SeasonChoice[]> {
    const competitions = this.competitions.filter(
      (competition) => competitionId === null || competition.id === competitionId,
    );
    const now = this.clock.now();
    const seasons = await this.calendar.findSeasons(competitions.map((competition) => competition.id));
    return seasons
      .filter((season) => season.firstMatchAt.getTime() <= now.getTime())
      .toSorted((a, b) => b.firstMatchAt.getTime() - a.firstMatchAt.getTime())
      .map((season) => ({
        id: season.id,
        name: season.name,
        competitionName:
          competitions.find((competition) => competition.id === season.competitionId)?.name ??
          season.competitionId,
      }));
  }
}
