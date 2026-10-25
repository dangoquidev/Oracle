import type { GuildId } from '../../domain/shared/ids.js';
import type { GuildPermissionChecker } from '../ports/guild-permission-checker.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { HandleResourceDeleted } from './handle-resource-deleted.js';
import type { LeaveGuild } from './leave-guild.js';
import type { RegisterGuild } from './register-guild.js';

/**
 * Catches up with what happened while the bot was offline:
 * servers joined or left, configured role or channel deleted.
 */
export class ReconcileGuilds {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly permissions: GuildPermissionChecker,
    private readonly registerGuild: RegisterGuild,
    private readonly leaveGuild: LeaveGuild,
    private readonly handleResourceDeleted: HandleResourceDeleted,
  ) {}

  async execute(currentGuildIds: readonly GuildId[]): Promise<void> {
    const current = new Set(currentGuildIds);
    const known = new Set(await this.guilds.listPresentIds());

    for (const guildId of current) {
      if (!known.has(guildId)) await this.registerGuild.execute(guildId);
    }
    for (const guildId of known) {
      if (!current.has(guildId)) await this.leaveGuild.execute(guildId);
    }

    for (const guild of await this.guilds.listActive()) {
      if (!guild.settings || !current.has(guild.id)) continue;
      const { channelId, pingRoleId } = guild.settings;
      const { issues } = await this.permissions.checkPublication(guild.id, channelId, pingRoleId);
      if (issues.includes('role-not-found')) {
        await this.handleResourceDeleted.execute(guild.id, { roleId: pingRoleId });
      } else if (issues.includes('channel-not-found')) {
        await this.handleResourceDeleted.execute(guild.id, { channelId });
      }
    }
  }
}
