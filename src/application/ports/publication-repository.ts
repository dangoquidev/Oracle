import type { ChannelId, GuildId, WeekId } from '../../domain/shared/ids.js';

export type PublicationId = number;

export interface Publication {
  readonly id: PublicationId;
  readonly guildId: GuildId;
  readonly weekIds: readonly WeekId[];
}

/** A posted announcement whose weeks are not over yet. */
export interface ActivePublication extends Publication {
  readonly channelId: ChannelId;
  readonly messageId: string | null;
  /** Fingerprint of the content last rendered, to edit the message only when it changed. */
  readonly fingerprint: string | null;
}

export interface PublicationRepository {
  findPublishedWeekIds(guildId: GuildId, weekIds: readonly WeekId[]): Promise<Set<WeekId>>;
  /**
   * Claims the weeks for one announcement. Returns null when another process
   * already claimed any of them, so a week is never announced twice.
   */
  reserve(
    guildId: GuildId,
    weekIds: readonly WeekId[],
    channelId: ChannelId,
    at: Date,
  ): Promise<PublicationId | null>;
  attachMessage(publicationId: PublicationId, messageId: string, fingerprint: string): Promise<void>;
  /** Drops a reservation whose message could not be sent, so it is retried later. */
  release(publicationId: PublicationId): Promise<void>;
  find(publicationId: PublicationId): Promise<Publication | null>;
  /** Announcements of the server with at least one match scheduled after `endingAfter`. */
  findActive(guildId: GuildId, endingAfter: Date): Promise<ActivePublication[]>;
  setFingerprint(publicationId: PublicationId, fingerprint: string): Promise<void>;
}
