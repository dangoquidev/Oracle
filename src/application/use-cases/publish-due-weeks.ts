import { nextSlot, weeksDueForPublication } from '../../domain/schedule/publish-schedule.js';
import { accessOf, type Guild } from '../../domain/guild/guild.js';
import type { GuildId, WeekId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildMessenger } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';
import type { PublicationRepository } from '../ports/publication-repository.js';

/** Announces the weeks that are due on every active server. Safe to run every minute. */
export class PublishDueWeeks {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly publications: PublicationRepository,
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
    const published = await this.publications.findPublishedWeekIds(
      guild.id,
      candidates.map((week) => week.id),
    );
    const due = weeksDueForPublication(candidates, settings.publish, settings.timeZone, now, published);
    if (due.length === 0) return [];

    const weekIds = due.map((week) => week.id);
    const publicationId = await this.publications.reserve(guild.id, weekIds, settings.channelId, now);
    if (publicationId === null) return [];

    try {
      const messageId = await this.messenger.announceWeeks({
        guildId: guild.id,
        channelId: settings.channelId,
        pingRoleId: settings.pingRoleId,
        locale: settings.locale,
        timeZone: settings.timeZone,
        publicationId,
        weeks: await this.calendar.findWeekViews(weekIds),
      });
      await this.publications.attachMessage(publicationId, messageId);
    } catch (error) {
      await this.publications.release(publicationId);
      throw error;
    }

    this.logger.info({ guildId: guild.id, weekIds, publicationId }, 'Weeks published');
    return weekIds;
  }
}
