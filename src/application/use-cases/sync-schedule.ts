import type { Competition } from '../../domain/competition/competition.js';
import type { CompetitionId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { MatchDataProvider } from '../ports/match-data-provider.js';
import { buildCalendarSnapshot } from './build-calendar-snapshot.js';

const LOOKBACK_DAYS = 30;
const DAY_MS = 86_400_000;

export interface CompetitionSyncReport {
  readonly competitionId: CompetitionId;
  readonly tournaments: number;
  readonly matches: number;
}

/**
 * Mirrors the provider calendar (tournaments, weeks, teams, matches, results) into the local cache.
 * The provider is the source of truth: changed dates overwrite local ones, and locks follow
 * since they are always derived from match times.
 */
export class SyncSchedule {
  constructor(
    private readonly provider: MatchDataProvider,
    private readonly calendar: CalendarRepository,
    private readonly competitions: readonly Competition[],
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<CompetitionSyncReport[]> {
    const reports: CompetitionSyncReport[] = [];
    const failures: unknown[] = [];
    for (const competition of this.competitions) {
      try {
        reports.push(await this.syncCompetition(competition));
      } catch (error) {
        this.logger.error({ competitionId: competition.id, err: error }, 'Schedule sync failed');
        failures.push(error);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, `Schedule sync failed for ${failures.length} competition(s)`);
    return reports;
  }

  private async syncCompetition(competition: Competition): Promise<CompetitionSyncReport> {
    const endingAfter = new Date(this.clock.now().getTime() - LOOKBACK_DAYS * DAY_MS);
    const tournaments = await this.provider.fetchTournaments(competition.source, endingAfter);
    if (tournaments.length === 0) return { competitionId: competition.id, tournaments: 0, matches: 0 };

    const matches = await this.provider.fetchMatches(tournaments.map((tournament) => tournament.ref));
    const teamNames = [...new Set(matches.flatMap((match) => [match.team1, match.team2]))].filter(
      (name): name is string => name !== null,
    );
    const teams = teamNames.length > 0 ? await this.provider.fetchTeams(teamNames) : [];

    const { snapshot, skippedMatchRefs } = buildCalendarSnapshot({
      competition,
      tournaments,
      matches,
      teams,
    });
    if (skippedMatchRefs.length > 0) {
      this.logger.warn({ competitionId: competition.id, skippedMatchRefs }, 'Skipped unsupported matches');
    }
    await this.calendar.applySnapshot(snapshot);

    const report = {
      competitionId: competition.id,
      tournaments: snapshot.tournaments.length,
      matches: snapshot.matches.length,
    };
    this.logger.info(report, 'Schedule synced');
    return report;
  }
}
