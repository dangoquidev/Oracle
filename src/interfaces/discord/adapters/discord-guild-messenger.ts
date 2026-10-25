import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type MessageCreateOptions,
} from 'discord.js';
import type { GuildMessenger, WeekAnnouncement } from '../../../application/ports/guild-messenger.js';
import type { Logger } from '../../../application/ports/logger.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import type { PauseReason } from '../../../domain/guild/guild.js';
import type { GuildId } from '../../../domain/shared/ids.js';
import type { MessageView } from '../components/payload.js';
import { renderPauseNotice, renderWelcome } from '../embeds/notices.js';
import { renderWeekAnnouncement } from '../embeds/week-announcement.js';

const WRITE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

export class DiscordGuildMessenger implements GuildMessenger {
  constructor(
    private readonly client: Client,
    private readonly logger: Logger,
  ) {}

  async sendWelcome(guildId: GuildId): Promise<void> {
    await this.sendToAdmins(guildId, renderWelcome());
  }

  async notifyPaused(guildId: GuildId, reason: PauseReason, locale: Locale): Promise<void> {
    await this.sendToAdmins(guildId, renderPauseNotice(reason, locale));
  }

  async announceWeeks(announcement: WeekAnnouncement): Promise<string> {
    const guild = await this.client.guilds.fetch(announcement.guildId);
    const channel = await guild.channels.fetch(announcement.channelId);
    if (!channel?.isTextBased()) throw new Error(`Channel ${announcement.channelId} is not a text channel`);

    const useEmojis = canUseExternalEmojis(channel, guild);
    const view = renderWeekAnnouncement(announcement, useEmojis);
    const message = await channel.send({
      ...toCreateOptions(view),
      allowedMentions: { roles: [announcement.pingRoleId] },
    });
    return message.id;
  }

  /**
   * Admin-facing notices go to the system channel, else the first channel the bot can write in,
   * else the owner's DMs.
   */
  private async sendToAdmins(guildId: GuildId, view: MessageView): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = writableAdminChannel(guild);
    if (channel) {
      await channel.send(toCreateOptions(view));
      return;
    }
    const owner = await guild.fetchOwner();
    await owner.send(toCreateOptions(view));
    this.logger.info({ guildId }, 'Admin notice sent to the server owner by DM');
  }
}

function writableAdminChannel(guild: Guild): GuildTextBasedChannel | null {
  const me = guild.members.me;
  if (!me) return null;
  const canWrite = (channel: GuildTextBasedChannel) => channel.permissionsFor(me).has(WRITE_PERMISSIONS);

  if (guild.systemChannel && canWrite(guild.systemChannel)) return guild.systemChannel;
  const candidates = guild.channels.cache
    .filter((channel) => channel.type === ChannelType.GuildText)
    .sorted((a, b) => a.rawPosition - b.rawPosition);
  for (const channel of candidates.values()) {
    if (canWrite(channel)) return channel;
  }
  return null;
}

function canUseExternalEmojis(channel: GuildTextBasedChannel, guild: Guild): boolean {
  const me = guild.members.me;
  return me ? channel.permissionsFor(me).has(PermissionFlagsBits.UseExternalEmojis) : false;
}

function toCreateOptions(view: MessageView): MessageCreateOptions {
  return {
    ...(view.content ? { content: view.content } : {}),
    embeds: view.embeds,
    components: view.components,
  };
}
