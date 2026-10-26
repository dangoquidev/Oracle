import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import type {
  ActivePublication,
  Publication,
  PublicationId,
  PublicationRepository,
} from '../../application/ports/publication-repository.js';
import type { DayKey, PublishedScope } from '../../domain/schedule/publication-plan.js';
import type { ChannelId, GuildId, WeekId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { matches, publications, publicationWeeks } from '../db/schema.js';
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

  async findPublishedScopes(guildId: GuildId, weekIds: readonly WeekId[]): Promise<PublishedScope[]> {
    if (weekIds.length === 0) return [];
    const rows = await this.db
      .select({ weekId: publicationWeeks.weekId, dayKey: publicationWeeks.dayKey })
      .from(publicationWeeks)
      .where(and(eq(publicationWeeks.guildId, guildId), inArray(publicationWeeks.weekId, [...weekIds])));
    return rows.map((row) => ({ weekId: row.weekId, day: toDay(row.dayKey) }));
  }

  async reserve(
    guildId: GuildId,
    weekIds: readonly WeekId[],
    channelId: ChannelId,
    at: Date,
    day: DayKey | null = null,
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
          .values(
            weekIds.map((weekId) => ({ publicationId: publication.id, guildId, weekId, dayKey: day ?? '' })),
          );
        return publication.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async attachMessage(publicationId: PublicationId, messageId: string, fingerprint: string): Promise<void> {
    await this.db
      .update(publications)
      .set({ messageId, fingerprint })
      .where(eq(publications.id, publicationId));
  }

  async release(publicationId: PublicationId): Promise<void> {
    await this.db.delete(publications).where(eq(publications.id, publicationId));
  }

  async find(publicationId: PublicationId): Promise<Publication | null> {
    const rows = await this.db
      .select({
        guildId: publications.guildId,
        weekId: publicationWeeks.weekId,
        dayKey: publicationWeeks.dayKey,
      })
      .from(publications)
      .innerJoin(publicationWeeks, eq(publicationWeeks.publicationId, publications.id))
      .where(eq(publications.id, publicationId));
    const [first] = rows;
    if (!first) return null;
    return {
      id: publicationId,
      guildId: first.guildId,
      weekIds: rows.map((row) => row.weekId),
      day: toDay(first.dayKey),
    };
  }

  async findActive(guildId: GuildId, endingAfter: Date): Promise<ActivePublication[]> {
    const active = this.db
      .selectDistinct({ id: publicationWeeks.publicationId })
      .from(publicationWeeks)
      .innerJoin(matches, eq(matches.weekId, publicationWeeks.weekId))
      .where(and(eq(publicationWeeks.guildId, guildId), gte(matches.scheduledAt, endingAfter)));
    const rows = await this.db
      .select({ publication: publications, weekId: publicationWeeks.weekId, dayKey: publicationWeeks.dayKey })
      .from(publications)
      .innerJoin(publicationWeeks, eq(publicationWeeks.publicationId, publications.id))
      .where(inArray(publications.id, active))
      .orderBy(asc(publications.id), asc(publicationWeeks.weekId));

    const byId = new Map<PublicationId, ActivePublication & { weekIds: WeekId[] }>();
    for (const { publication, weekId, dayKey } of rows) {
      const entry = byId.get(publication.id) ?? {
        id: publication.id,
        guildId: publication.guildId,
        channelId: publication.channelId,
        messageId: publication.messageId,
        fingerprint: publication.fingerprint,
        weekIds: [],
        day: toDay(dayKey),
      };
      entry.weekIds.push(weekId);
      byId.set(publication.id, entry);
    }
    return [...byId.values()];
  }

  async setFingerprint(publicationId: PublicationId, fingerprint: string): Promise<void> {
    await this.db.update(publications).set({ fingerprint }).where(eq(publications.id, publicationId));
  }
}

function toDay(dayKey: string): DayKey | null {
  return dayKey === '' ? null : dayKey;
}
