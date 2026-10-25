import { accessOf } from '../../domain/guild/guild.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { WeekView } from '../read-models/views.js';

const DAY_MS = 86_400_000;
const HORIZON_MS = 21 * DAY_MS;
const RECENT_MS = 14 * DAY_MS;

/** upcoming: matches not started yet (open/close votes). recent: matches played lately (results). */
export type TargetScope = 'upcoming' | 'recent';

export interface LockTargets {
  readonly timeZone: string;
  readonly weeks: readonly WeekView[];
}

/** Weeks and matches an admin may act on, among the enabled competitions. */
export class ListLockTargets {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly clock: Clock,
  ) {}

  async execute(guildId: GuildId, scope: TargetScope = 'upcoming'): Promise<LockTargets> {
    const guild = await this.guilds.find(guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return { timeZone: 'UTC', weeks: [] };
    const now = this.clock.now();
    const [from, to] =
      scope === 'upcoming'
        ? [now, new Date(now.getTime() + HORIZON_MS)]
        : [new Date(now.getTime() - RECENT_MS), now];
    const weeks = await this.calendar.findWeeksBetween(guild.settings.competitionIds, from, to);
    const views = await this.calendar.findWeekViews(weeks.map((week) => week.id));
    const targets = views
      .map((view) => ({
        ...view,
        matches: view.matches.filter((match) =>
          scope === 'upcoming'
            ? match.status === 'scheduled' && match.scheduledAt > now
            : match.scheduledAt <= now && match.scheduledAt >= from,
        ),
      }))
      .filter((view) => view.matches.length > 0);
    if (scope === 'recent') targets.reverse();
    return { timeZone: guild.settings.timeZone, weeks: targets };
  }
}
