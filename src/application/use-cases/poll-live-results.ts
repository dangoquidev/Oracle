import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ScorePredictions } from './score-predictions.js';
import type { SyncSchedule } from './sync-schedule.js';

const HOUR_MS = 3_600_000;
/** A match window lasts from its start until its result shows up, at most this long. */
const RESULT_WINDOW_MS = 8 * HOUR_MS;
const SCORING_LOOKBACK_MS = 2 * 24 * HOUR_MS;

/**
 * Frequent, cheap result polling: does nothing (no provider call) outside match windows,
 * otherwise re-syncs only the competitions with matches awaiting a result, then scores.
 */
export class PollLiveResults {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly syncSchedule: SyncSchedule,
    private readonly scorePredictions: ScorePredictions,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Returns false when no match window is open. */
  async execute(): Promise<boolean> {
    const now = this.clock.now();
    const competitionIds = await this.calendar.findCompetitionsAwaitingResults(
      new Date(now.getTime() - RESULT_WINDOW_MS),
      now,
    );
    if (competitionIds.length === 0) return false;

    this.logger.debug({ competitionIds }, 'Polling live results');
    try {
      await this.syncSchedule.execute({ competitionIds, refreshKnownTeams: false });
    } finally {
      await this.scorePredictions.execute({ since: new Date(now.getTime() - SCORING_LOOKBACK_MS) });
    }
    return true;
  }
}
