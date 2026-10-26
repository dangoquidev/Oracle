import { accessOf, type Guild } from '../../domain/guild/guild.js';
import type { GuildSettings } from '../../domain/guild/guild-settings.js';
import { planPublications, type DayKey, type PlannableWeek } from '../../domain/schedule/publication-plan.js';
import { nextSlot } from '../../domain/schedule/publish-schedule.js';
import type { GuildId, WeekId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildMessenger } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';
import type { PublicationRepository } from '../ports/publication-repository.js';
import { announcementFingerprint } from '../read-models/fingerprint.js';
import { scopeWeeks } from '../read-models/publication-scope.js';
import type { WeekView } from '../read-models/views.js';
import type { LockCalculatorFactory } from './lock-calculator.js';

/**
 * Announces what is due on every active server: weeks whose matchups are known as a whole, and
 * otherwise each day once its matchups are known. Safe to run every minute.
 */
export class PublishDueWeeks {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly publications: PublicationRepository,
    private readonly locks: LockCalculatorFactory,
    private readonly messenger: GuildMessenger,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async executeForAll(): Promise<void> {
    for (const guild of await this.guilds.listActive()) {
      try {
        await this.publishFor(guild);
      } catch (error) {
        this.logger.error({ guildId: guild.id, err: error }, 'Week publication failed');
      }
    }
  }

  /** Returns the weeks announced (whole or for one of their days). */
  async execute(guildId: GuildId): Promise<WeekId[]> {
    return this.publishFor(await this.guilds.find(guildId));
  }

  private async publishFor(guild: Guild | null): Promise<WeekId[]> {
    if (!guild?.settings || accessOf(guild) !== 'allowed') return [];
    const { settings } = guild;
    const now = this.clock.now();

    const candidates = await this.calendar.findWeeksBetween(
      settings.competitionIds,
      now,
      nextSlot(settings.publish, settings.timeZone, now),
    );
    if (candidates.length === 0) return [];
    const views = await this.calendar.findWeekViews(candidates.map((week) => week.id));
    const published = await this.publications.findPublishedScopes(
      guild.id,
      views.map((view) => view.week.id),
    );
    const plan = planPublications(
      await this.plannable(guild.id, settings, views, now),
      published,
      settings.publish,
      settings.timeZone,
      now,
    );

    const announced: WeekId[] = [];
    if (plan.weeks.length > 0) {
      const weekIds = plan.weeks.map((week) => week.id);
      const weeks = views.filter((view) => weekIds.includes(view.week.id));
      if (await this.announce(guild.id, settings, weeks, null, now)) announced.push(...weekIds);
    }
    for (const { week, day } of plan.days) {
      const weeks = views.filter((view) => view.week.id === week.id);
      if (await this.announce(guild.id, settings, weeks, day, now)) announced.push(week.id);
    }
    return announced;
  }

  private async plannable(
    guildId: GuildId,
    settings: GuildSettings,
    views: readonly WeekView[],
    now: Date,
  ): Promise<PlannableWeek[]> {
    const locks = this.locks.forGuild(guildId, settings);
    const weeks: PlannableWeek[] = [];
    for (const view of views) {
      const matches = [];
      for (const match of view.matches) {
        matches.push({
          id: match.id,
          matchDay: match.matchDay,
          scheduledAt: match.scheduledAt,
          opponentsKnown: match.team1 !== null && match.team2 !== null,
          open: match.status === 'scheduled' && (await locks.lockAtOf(match)).getTime() > now.getTime(),
        });
      }
      weeks.push({ ...view.week, matches });
    }
    return weeks;
  }

  /** Claims, posts and records one announcement; false when another process claimed it first. */
  private async announce(
    guildId: GuildId,
    settings: GuildSettings,
    views: readonly WeekView[],
    day: DayKey | null,
    now: Date,
  ): Promise<boolean> {
    const weekIds = views.map((view) => view.week.id);
    const publicationId = await this.publications.reserve(guildId, weekIds, settings.channelId, now, day);
    if (publicationId === null) return false;

    const weeks = scopeWeeks(views, day, settings.timeZone);
    try {
      const messageId = await this.messenger.announceWeeks({
        guildId,
        channelId: settings.channelId,
        pingRoleId: settings.pingRoleId,
        locale: settings.locale,
        timeZone: settings.timeZone,
        publicationId,
        scope: day === null ? 'week' : 'day',
        weeks,
      });
      await this.publications.attachMessage(publicationId, messageId, announcementFingerprint(weeks));
    } catch (error) {
      await this.publications.release(publicationId);
      throw error;
    }

    this.logger.info({ guildId, weekIds, day, publicationId }, day ? 'Day published' : 'Weeks published');
    return true;
  }
}
