import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';
import type {
  GuildMessenger,
  LockReminder,
  MatchRecap,
  SeasonRecap,
  VoteReveal,
  WeekAnnouncement,
} from '../../../application/ports/guild-messenger.js';
import type { Logger } from '../../../application/ports/logger.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import type { PauseReason } from '../../../domain/guild/guild.js';
import type { ChannelId, GuildId } from '../../../domain/shared/ids.js';
import type { MessageView } from '../components/payload.js';
import { renderLockReminder, renderVoteReveal } from '../embeds/lock-notices.js';
import { renderPauseNotice, renderWelcome } from '../embeds/notices.js';
import { renderMatchRecap, renderSeasonRecap } from '../embeds/recaps.js';
import { renderWeekAnnouncement } from '../embeds/week-announcement.js';

const WRITE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const GONE_ERRORS: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.UnknownChannel,
]);

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
    const { guild, channel } = await this.publicationChannel(announcement.guildId, announcement.channelId);
    const view = renderWeekAnnouncement(announcement, canUseExternalEmojis(channel, guild));
    const message = await channel.send({
      ...toCreateOptions(view),
      allowedMentions: { roles: [announcement.pingRoleId] },
    });
    return message.id;
  }

  async updateAnnouncement(messageId: string, announcement: WeekAnnouncement): Promise<boolean> {
    try {
      const { guild, channel } = await this.publicationChannel(announcement.guildId, announcement.channelId);
      const message = await channel.messages.fetch(messageId);
      const view = renderWeekAnnouncement(announcement, canUseExternalEmojis(channel, guild));
      // Editing never pings again: only new messages notify mentioned roles.
      await message.edit(toEditOptions(view));
      return true;
    } catch (error) {
      if (error instanceof DiscordAPIError && GONE_ERRORS.has(error.code)) return false;
      throw error;
    }
  }

  async sendLockReminder(reminder: LockReminder): Promise<void> {
    const { guild, channel } = await this.publicationChannel(reminder.guildId, reminder.channelId);
    const view = renderLockReminder(reminder, canUseExternalEmojis(channel, guild));
    await channel.send({ ...toCreateOptions(view), allowedMentions: { roles: [reminder.pingRoleId] } });
  }

  async revealVotes(reveal: VoteReveal): Promise<void> {
    const { guild, channel } = await this.publicationChannel(reveal.guildId, reveal.channelId);
    const view = renderVoteReveal(reveal, canUseExternalEmojis(channel, guild));
    await channel.send({ ...toCreateOptions(view), allowedMentions: { parse: [] } });
  }

  async sendMatchRecap(recap: MatchRecap): Promise<void> {
    const { guild, channel } = await this.publicationChannel(recap.guildId, recap.channelId);
    const view = renderMatchRecap(recap, canUseExternalEmojis(channel, guild));
    await channel.send({ ...toCreateOptions(view), allowedMentions: { parse: [] } });
  }

  async sendSeasonRecap(recap: SeasonRecap): Promise<void> {
    const { channel } = await this.publicationChannel(recap.guildId, recap.channelId);
    await channel.send({ ...toCreateOptions(renderSeasonRecap(recap)), allowedMentions: { parse: [] } });
  }

  private async publicationChannel(
    guildId: GuildId,
    channelId: ChannelId,
  ): Promise<{ guild: Guild; channel: GuildTextBasedChannel }> {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isTextBased()) throw new Error(`Channel ${channelId} is not a text channel`);
    return { guild, channel };
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

function toEditOptions(view: MessageView): MessageEditOptions {
  return {
    ...(view.content ? { content: view.content } : {}),
    embeds: view.embeds,
    components: view.components,
  };
}
