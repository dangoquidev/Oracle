import { PermissionFlagsBits, type Client } from 'discord.js';
import type {
  GuildPermissionChecker,
  PublicationCheck,
  PublicationIssue,
  PublicationWarning,
} from '../../../application/ports/guild-permission-checker.js';
import type { ChannelId, GuildId, RoleId } from '../../../domain/shared/ids.js';

export class DiscordPermissionChecker implements GuildPermissionChecker {
  constructor(private readonly client: Client) {}

  async checkPublication(guildId: GuildId, channelId: ChannelId, roleId: RoleId): Promise<PublicationCheck> {
    const guild = await this.client.guilds.fetch(guildId);
    const [channel, role, me] = await Promise.all([
      guild.channels.fetch(channelId).catch(() => null),
      guild.roles.fetch(roleId).catch(() => null),
      guild.members.fetchMe(),
    ]);

    const issues: PublicationIssue[] = [];
    const warnings: PublicationWarning[] = [];
    if (!role) issues.push('role-not-found');
    if (!channel?.isTextBased()) {
      issues.push('channel-not-found');
      return { issues, warnings };
    }

    const permissions = channel.permissionsFor(me);
    if (!permissions.has(PermissionFlagsBits.ViewChannel)) issues.push('cannot-view-channel');
    if (!permissions.has(PermissionFlagsBits.SendMessages)) issues.push('cannot-send-messages');
    if (!permissions.has(PermissionFlagsBits.EmbedLinks)) issues.push('cannot-embed-links');
    if (role && !role.mentionable && !permissions.has(PermissionFlagsBits.MentionEveryone)) {
      issues.push('cannot-mention-role');
    }
    if (!permissions.has(PermissionFlagsBits.UseExternalEmojis)) warnings.push('cannot-use-external-emojis');
    return { issues, warnings };
  }
}
