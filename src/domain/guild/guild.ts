import type { ChannelId, GuildId, RoleId } from '../shared/ids.js';
import type { GuildSettings } from './guild-settings.js';

/**
 * unconfigured: joined, waiting for /configure — the bot stays silent.
 * active: configured and running.
 * paused: a configured role or channel disappeared; an admin must run /configure again.
 * left: the bot was removed from the server (data kept for history).
 */
export type GuildStatus = 'unconfigured' | 'active' | 'paused' | 'left';

export type PauseReason = 'role-deleted' | 'channel-deleted';

export interface Guild {
  readonly id: GuildId;
  readonly status: GuildStatus;
  readonly pauseReason: PauseReason | null;
  readonly settings: GuildSettings | null;
}

export type GuildAccess = 'allowed' | 'unconfigured' | 'paused';

export function accessOf(guild: Guild | null): GuildAccess {
  if (guild?.status === 'active' && guild.settings) return 'allowed';
  if (guild?.status === 'paused') return 'paused';
  return 'unconfigured';
}

/** Which configured resource, if any, a deleted Discord role or channel was. */
export function pauseReasonForDeletion(
  settings: GuildSettings,
  deleted: { readonly roleId?: RoleId; readonly channelId?: ChannelId },
): PauseReason | null {
  if (deleted.roleId !== undefined && deleted.roleId === settings.pingRoleId) return 'role-deleted';
  if (deleted.channelId !== undefined && deleted.channelId === settings.channelId) return 'channel-deleted';
  return null;
}
