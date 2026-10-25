import { and, eq, inArray } from 'drizzle-orm';
import type {
  Publication,
  PublicationId,
  PublicationRepository,
} from '../../application/ports/publication-repository.js';
import type { ChannelId, GuildId, WeekId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { publications, publicationWeeks } from '../db/schema.js';
import { isUniqueViolation } from './sql-helpers.js';

export class DrizzlePublicationRepository implements PublicationRepository {
  constructor(private readonly db: Database) {}

  async findPublishedWeekIds(guildId: GuildId, weekIds: readonly WeekId[]): Promise<Set<WeekId>> {
    if (weekIds.length === 0) return new Set();
    const rows = await this.db
      .select({ weekId: publicationWeeks.weekId })
      .from(publicationWeeks)
      .where(and(eq(publicationWeeks.guildId, guildId), inArray(publicationWeeks.weekId, [...weekIds])));
    return new Set(rows.map((row) => row.weekId));
  }

  async reserve(
    guildId: GuildId,
    weekIds: readonly WeekId[],
    channelId: ChannelId,
    at: Date,
  ): Promise<PublicationId | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const [publication] = await tx
          .insert(publications)
          .values({ guildId, channelId, publishedAt: at })
          .returning({ id: publications.id });
        if (!publication) throw new Error('Publication insert returned nothing');
        await tx
          .insert(publicationWeeks)
          .values(weekIds.map((weekId) => ({ publicationId: publication.id, guildId, weekId })));
        return publication.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async attachMessage(publicationId: PublicationId, messageId: string): Promise<void> {
    await this.db.update(publications).set({ messageId }).where(eq(publications.id, publicationId));
  }

  async release(publicationId: PublicationId): Promise<void> {
    await this.db.delete(publications).where(eq(publications.id, publicationId));
  }

  async find(publicationId: PublicationId): Promise<Publication | null> {
    const rows = await this.db
      .select({ guildId: publications.guildId, weekId: publicationWeeks.weekId })
      .from(publications)
      .innerJoin(publicationWeeks, eq(publicationWeeks.publicationId, publications.id))
      .where(eq(publications.id, publicationId));
    const [first] = rows;
    if (!first) return null;
    return { id: publicationId, guildId: first.guildId, weekIds: rows.map((row) => row.weekId) };
  }
}
