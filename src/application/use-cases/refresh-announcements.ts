import type { Guild } from '../../domain/guild/guild.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildMessenger } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';
import type { ActivePublication, PublicationRepository } from '../ports/publication-repository.js';
import { announcementFingerprint } from '../read-models/fingerprint.js';
import { scopeWeeks } from '../read-models/publication-scope.js';

/**
 * Keeps posted announcements in line with the calendar: teams decided after posting,
 * rescheduled matches, logos uploaded later. Messages are edited only when their content changed.
 */
export class RefreshAnnouncements {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly publications: PublicationRepository,
    private readonly calendar: CalendarRepository,
    private readonly messenger: GuildMessenger,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async executeForAll(): Promise<number> {
    let edited = 0;
    for (const guild of await this.guilds.listActive()) {
      for (const publication of await this.publications.findActive(guild.id, this.clock.now())) {
        try {
          if (await this.refresh(guild, publication)) edited += 1;
        } catch (error) {
          this.logger.warn(
            { guildId: guild.id, publicationId: publication.id, err: error },
            'Announcement refresh failed',
          );
        }
      }
    }
    if (edited > 0) this.logger.info({ edited }, 'Announcements refreshed');
    return edited;
  }

  private async refresh(guild: Guild, publication: ActivePublication): Promise<boolean> {
    if (!guild.settings || publication.messageId === null) return false;
    const weeks = scopeWeeks(
      await this.calendar.findWeekViews(publication.weekIds),
      publication.day,
      guild.settings.timeZone,
    );
    const fingerprint = announcementFingerprint(weeks);
    if (fingerprint === publication.fingerprint) return false;

    const exists = await this.messenger.updateAnnouncement(publication.messageId, {
      guildId: guild.id,
      channelId: publication.channelId,
      pingRoleId: guild.settings.pingRoleId,
      locale: guild.settings.locale,
      timeZone: guild.settings.timeZone,
      publicationId: publication.id,
      scope: publication.day === null ? 'week' : 'day',
      weeks,
    });
    // A deleted message is not recreated; remember the content to stop retrying.
    await this.publications.setFingerprint(publication.id, fingerprint);
    return exists;
  }
}
