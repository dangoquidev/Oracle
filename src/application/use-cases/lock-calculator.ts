import { computeLockAt, type LockableMatch } from '../../domain/lock/lock-policy.js';
import type { GuildSettings } from '../../domain/guild/guild-settings.js';
import type { Match } from '../../domain/match/match.js';
import type { WeekId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';

/** Computes lock instants for a server, loading each week's matches once. */
export class LockCalculator {
  private readonly weekMatches = new Map<WeekId, Promise<Match[]>>();

  constructor(
    private readonly calendar: CalendarRepository,
    private readonly settings: Pick<GuildSettings, 'lock' | 'timeZone'>,
  ) {}

  async lockAtOf(match: LockableMatch): Promise<Date> {
    let siblings = this.weekMatches.get(match.weekId);
    if (!siblings) {
      siblings = this.calendar.findWeekMatches(match.weekId);
      this.weekMatches.set(match.weekId, siblings);
    }
    return computeLockAt(match, await siblings, this.settings.lock, this.settings.timeZone);
  }
}
