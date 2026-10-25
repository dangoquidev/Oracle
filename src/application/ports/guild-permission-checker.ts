import type { ChannelId, GuildId, RoleId } from '../../domain/shared/ids.js';

export type PublicationIssue =
  | 'channel-not-found'
  | 'role-not-found'
  | 'cannot-view-channel'
  | 'cannot-send-messages'
  | 'cannot-embed-links'
  | 'cannot-mention-role';

export type PublicationWarning = 'cannot-use-external-emojis';

export interface PublicationCheck {
  /** Blocking problems: the bot could not announce weeks properly. */
  readonly issues: readonly PublicationIssue[];
  /** Degraded but workable (e.g. team logos shown as text). */
  readonly warnings: readonly PublicationWarning[];
}

export interface GuildPermissionChecker {
  checkPublication(guildId: GuildId, channelId: ChannelId, roleId: RoleId): Promise<PublicationCheck>;
}
