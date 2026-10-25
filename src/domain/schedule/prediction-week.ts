import type { CompetitionId, WeekId } from '../shared/ids.js';

/** A week as defined by the data provider's calendar (e.g. "Week 3", "Swiss Round 2"). */
export interface PredictionWeek {
  readonly id: WeekId;
  readonly competitionId: CompetitionId;
  readonly name: string;
  /** Scheduled time of the week's first match. */
  readonly startsAt: Date;
  /** Scheduled time of the week's last match. */
  readonly endsAt: Date;
}
