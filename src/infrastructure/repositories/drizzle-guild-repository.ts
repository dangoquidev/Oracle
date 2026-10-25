import { eq, inArray, ne, sql } from 'drizzle-orm';
import type { GuildRepository } from '../../application/ports/guild-repository.js';
import type { GuildSettings } from '../../domain/guild/guild-settings.js';
import type { Guild, PauseReason } from '../../domain/guild/guild.js';
import type { Weekday } from '../../domain/schedule/publish-schedule.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { guildCompetitions, guilds } from '../db/schema.js';

type GuildRow = typeof guilds.$inferSelect;

export class DrizzleGuildRepository implements GuildRepository {
  constructor(private readonly db: Database) {}

  async find(guildId: GuildId): Promise<Guild | null> {
    const [row] = await this.db.select().from(guilds).where(eq(guilds.id, guildId));
    if (!row) return null;
    return toGuild(row, await this.competitionIdsOf([guildId]));
  }

  async register(guildId: GuildId): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ status: guilds.status })
        .from(guilds)
        .where(eq(guilds.id, guildId))
        .for('update');
      if (!existing) {
        await tx.insert(guilds).values({ id: guildId, status: 'unconfigured' });
        return true;
      }
      if (existing.status !== 'left') return false;
      // Settings are kept to prefill the wizard, but the server must be configured again.
      await tx
        .update(guilds)
        .set({ status: 'unconfigured', pauseReason: null, updatedAt: sql`now()` })
        .where(eq(guilds.id, guildId));
      return true;
    });
  }

  async saveSettings(guildId: GuildId, settings: GuildSettings): Promise<void> {
    const columns = {
      status: 'active' as const,
      pauseReason: null,
      locale: settings.locale,
      pingRoleId: settings.pingRoleId,
      channelId: settings.channelId,
      timeZone: settings.timeZone,
      publishWeekday: settings.publish.weekday,
      publishHour: settings.publish.hour,
      publishMinute: settings.publish.minute,
      lockMode: settings.lock.mode,
      lockOffsetMinutes: settings.lock.offsetMinutes,
      recapFrequency: settings.recapFrequency,
      remindersEnabled: settings.reminders.enabled,
      reminderOffsetMinutes: settings.reminders.offsetMinutes,
      configuredAt: sql`now()`,
      updatedAt: sql`now()`,
    };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(guilds)
        .values({ id: guildId, ...columns })
        .onConflictDoUpdate({ target: guilds.id, set: columns });
      await tx.delete(guildCompetitions).where(eq(guildCompetitions.guildId, guildId));
      if (settings.competitionIds.length > 0) {
        await tx
          .insert(guildCompetitions)
          .values(settings.competitionIds.map((competitionId) => ({ guildId, competitionId })));
      }
    });
  }

  async pause(guildId: GuildId, reason: PauseReason): Promise<void> {
    await this.db
      .update(guilds)
      .set({ status: 'paused', pauseReason: reason, updatedAt: sql`now()` })
      .where(eq(guilds.id, guildId));
  }

  async markLeft(guildId: GuildId): Promise<void> {
    await this.db
      .update(guilds)
      .set({ status: 'left', updatedAt: sql`now()` })
      .where(eq(guilds.id, guildId));
  }

  async listActive(): Promise<Guild[]> {
    const rows = await this.db.select().from(guilds).where(eq(guilds.status, 'active'));
    const competitionIds = await this.competitionIdsOf(rows.map((row) => row.id));
    return rows.map((row) => toGuild(row, competitionIds));
  }

  async listPresentIds(): Promise<GuildId[]> {
    const rows = await this.db.select({ id: guilds.id }).from(guilds).where(ne(guilds.status, 'left'));
    return rows.map((row) => row.id);
  }

  private async competitionIdsOf(guildIds: readonly GuildId[]): Promise<Map<GuildId, string[]>> {
    const byGuild = new Map<GuildId, string[]>();
    if (guildIds.length === 0) return byGuild;
    const rows = await this.db
      .select()
      .from(guildCompetitions)
      .where(inArray(guildCompetitions.guildId, [...guildIds]))
      .orderBy(guildCompetitions.competitionId);
    for (const row of rows)
      byGuild.set(row.guildId, [...(byGuild.get(row.guildId) ?? []), row.competitionId]);
    return byGuild;
  }
}

function toGuild(row: GuildRow, competitionIds: Map<GuildId, string[]>): Guild {
  return {
    id: row.id,
    status: row.status,
    pauseReason: row.pauseReason,
    settings: toSettings(row, competitionIds),
  };
}

function toSettings(row: GuildRow, competitionIds: Map<GuildId, string[]>): GuildSettings | null {
  const {
    locale,
    pingRoleId,
    channelId,
    timeZone,
    publishWeekday,
    publishHour,
    publishMinute,
    lockMode,
    lockOffsetMinutes,
    recapFrequency,
    remindersEnabled,
    reminderOffsetMinutes,
  } = row;
  if (
    locale === null ||
    pingRoleId === null ||
    channelId === null ||
    timeZone === null ||
    publishWeekday === null ||
    publishHour === null ||
    publishMinute === null ||
    lockMode === null ||
    lockOffsetMinutes === null ||
    recapFrequency === null ||
    remindersEnabled === null ||
    reminderOffsetMinutes === null
  ) {
    return null;
  }
  return {
    locale,
    pingRoleId,
    channelId,
    competitionIds: competitionIds.get(row.id) ?? [],
    timeZone,
    publish: { weekday: publishWeekday as Weekday, hour: publishHour, minute: publishMinute },
    lock: { mode: lockMode, offsetMinutes: lockOffsetMinutes },
    recapFrequency,
    reminders: { enabled: remindersEnabled, offsetMinutes: reminderOffsetMinutes },
  };
}
