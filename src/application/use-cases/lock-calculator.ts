import type { GuildSettings } from '../../domain/guild/guild-settings.js';
import { effectiveLockAt, type LockOverride } from '../../domain/lock/lock-override.js';
import { computeLockAt, type LockableMatch } from '../../domain/lock/lock-policy.js';
import type { Match } from '../../domain/match/match.js';
import type { GuildId, MatchId, WeekId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { LockOverrideRepository } from '../ports/lock-override-repository.js';

interface WeekContext {
  readonly matches: readonly Match[];
  readonly overrides: ReadonlyMap<MatchId, LockOverride>;
}

/** Effective lock instants for one server (policy + admin overrides), loading each week once. */
export class LockCalculator {
  private readonly weeks = new Map<WeekId, Promise<WeekContext>>();

  constructor(
    private readonly calendar: CalendarRepository,
    private readonly overrides: LockOverrideRepository,
    private readonly guildId: GuildId,
    private readonly settings: Pick<GuildSettings, 'lock' | 'timeZone'>,
  ) {}

  async lockAtOf(match: LockableMatch): Promise<Date> {
    const week = await this.weekContext(match.weekId);
    const computed = computeLockAt(match, week.matches, this.settings.lock, this.settings.timeZone);
    return effectiveLockAt(computed, match.scheduledAt, week.overrides.get(match.id) ?? null);
  }

  private weekContext(weekId: WeekId): Promise<WeekContext> {
    let context = this.weeks.get(weekId);
    if (!context) {
      context = this.loadWeek(weekId);
      this.weeks.set(weekId, context);
    }
    return context;
  }

  private async loadWeek(weekId: WeekId): Promise<WeekContext> {
    const matches = await this.calendar.findWeekMatches(weekId);
    const overrides = await this.overrides.findForMatches(
      this.guildId,
      matches.map((match) => match.id),
    );
    return { matches, overrides };
  }
}

/** Builds a calculator per server; injected where several use cases need locks. */
export class LockCalculatorFactory {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly overrides: LockOverrideRepository,
  ) {}

  forGuild(guildId: GuildId, settings: Pick<GuildSettings, 'lock' | 'timeZone'>): LockCalculator {
    return new LockCalculator(this.calendar, this.overrides, guildId, settings);
  }
}
