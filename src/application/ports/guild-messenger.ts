import type { Locale } from '../../domain/guild/guild-settings.js';
import type { PauseReason } from '../../domain/guild/guild.js';
import type { VoteDistribution } from '../../domain/prediction/vote-distribution.js';
import type { ChannelId, GuildId, RoleId } from '../../domain/shared/ids.js';
import type { MatchView, WeekView } from '../read-models/views.js';
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

export interface LockReminder {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly pingRoleId: RoleId;
  readonly locale: Locale;
  readonly publicationId: PublicationId;
  readonly competitionName: string;
  readonly weekName: string;
  readonly lockAt: Date;
  readonly matches: readonly MatchView[];
}

export interface VoteReveal {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly locale: Locale;
  readonly competitionName: string;
  readonly weekName: string;
  readonly matches: readonly { readonly match: MatchView; readonly distribution: VoteDistribution }[];
}

/** Outgoing messages to a server, rendered by the chat platform adapter. */
export interface GuildMessenger {
  /** Bilingual greeting asking an admin to run the setup. Best effort. */
  sendWelcome(guildId: GuildId): Promise<void>;
  /** Tells the admins the bot is paused and why. Best effort. */
  notifyPaused(guildId: GuildId, reason: PauseReason, locale: Locale): Promise<void>;
  /** Posts the week announcement and returns the message id. */
  announceWeeks(announcement: WeekAnnouncement): Promise<string>;
  /** Re-renders a posted announcement. Returns false when the message no longer exists. */
  updateAnnouncement(messageId: string, announcement: WeekAnnouncement): Promise<boolean>;
  /** Mentions the role shortly before votes close. */
  sendLockReminder(reminder: LockReminder): Promise<void>;
  /** Shows how the server voted once votes are closed. */
  revealVotes(reveal: VoteReveal): Promise<void>;
}
