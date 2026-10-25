import type { GuildSettings } from '../../domain/guild/guild-settings.js';
import type { Guild, PauseReason } from '../../domain/guild/guild.js';
import type { GuildId } from '../../domain/shared/ids.js';

export interface GuildRepository {
  find(guildId: GuildId): Promise<Guild | null>;
  /**
   * Records that the bot is on this server. Returns true when it was unknown or had left,
   * i.e. when the server should be greeted.
   */
  register(guildId: GuildId): Promise<boolean>;
  /** Stores validated settings and activates the server. */
  saveSettings(guildId: GuildId, settings: GuildSettings): Promise<void>;
  pause(guildId: GuildId, reason: PauseReason): Promise<void>;
  markLeft(guildId: GuildId): Promise<void>;
  listActive(): Promise<Guild[]>;
  /** Servers the bot believes it is still on (any status but "left"). */
  listPresentIds(): Promise<GuildId[]>;
}
