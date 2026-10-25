import type { ChannelId, GuildId, WeekId } from '../../domain/shared/ids.js';

export type PublicationId = number;

export interface Publication {
  readonly id: PublicationId;
  readonly guildId: GuildId;
  readonly weekIds: readonly WeekId[];
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
  attachMessage(publicationId: PublicationId, messageId: string): Promise<void>;
  /** Drops a reservation whose message could not be sent, so it is retried later. */
  release(publicationId: PublicationId): Promise<void>;
  find(publicationId: PublicationId): Promise<Publication | null>;
}
