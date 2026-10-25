import { accessOf } from '../../domain/guild/guild.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { WeekView } from '../read-models/views.js';

const HORIZON_MS = 21 * 86_400_000;

export interface LockTargets {
  readonly timeZone: string;
  readonly weeks: readonly WeekView[];
}

/** Weeks and matches an admin may open or close: upcoming ones of the enabled competitions. */
export class ListLockTargets {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly clock: Clock,
  ) {}

  async execute(guildId: GuildId): Promise<LockTargets> {
    const guild = await this.guilds.find(guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return { timeZone: 'UTC', weeks: [] };
    const now = this.clock.now();
    const weeks = await this.calendar.findWeeksBetween(
      guild.settings.competitionIds,
      now,
      new Date(now.getTime() + HORIZON_MS),
    );
    const views = await this.calendar.findWeekViews(weeks.map((week) => week.id));
    const targets = views
      .map((view) => ({
        ...view,
        matches: view.matches.filter((match) => match.status === 'scheduled' && match.scheduledAt > now),
      }))
      .filter((view) => view.matches.length > 0);
    return { timeZone: guild.settings.timeZone, weeks: targets };
  }
}
