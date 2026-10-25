import type { GuildId } from '../../domain/shared/ids.js';

/** Remembers which one-off notifications were sent, so each goes out exactly once. */
export interface DispatchLog {
  findSent(guildId: GuildId, keys: readonly string[]): Promise<Set<string>>;
  record(guildId: GuildId, key: string, at: Date): Promise<void>;
}
