import type { Locale } from '../../domain/guild/guild-settings.js';
import type { PauseReason } from '../../domain/guild/guild.js';
import type { ChannelId, GuildId, RoleId } from '../../domain/shared/ids.js';
import type { WeekView } from '../read-models/views.js';
import type { PublicationId } from './publication-repository.js';

export interface WeekAnnouncement {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly pingRoleId: RoleId;
  readonly locale: Locale;
  readonly timeZone: string;
  readonly publicationId: PublicationId;
  readonly weeks: readonly WeekView[];
}

/** Outgoing messages to a server, rendered by the chat platform adapter. */
export interface GuildMessenger {
  /** Bilingual greeting asking an admin to run the setup. Best effort. */
  sendWelcome(guildId: GuildId): Promise<void>;
  /** Tells the admins the bot is paused and why. Best effort. */
  notifyPaused(guildId: GuildId, reason: PauseReason, locale: Locale): Promise<void>;
  /** Posts the week announcement and returns the message id. */
  announceWeeks(announcement: WeekAnnouncement): Promise<string>;
}
