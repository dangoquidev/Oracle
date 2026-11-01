import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { toCreateOptions, type MessageView } from './components/payload.js';

/**
 * Posts a command result as a regular bot message in the channel, for everyone to see, rather than as
 * a reply to the command. Players listed are never pinged. Falls back to a public reply when the bot
 * cannot write in the channel.
 */
export async function postInChannel(
  interaction: ChatInputCommandInteraction<'cached'>,
  view: MessageView,
): Promise<void> {
  const { channel } = interaction;
  const me = interaction.guild.members.me;
  const canPost =
    channel !== null &&
    me !== null &&
    channel
      .permissionsFor(me)
      .has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ]);
  if (!canPost) {
    await interaction.reply({ ...view, allowedMentions: { parse: [] } });
    return;
  }
  // The command must be answered: a private placeholder, removed once the message is posted.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await channel.send({ ...toCreateOptions(view), allowedMentions: { parse: [] } });
  await interaction.deleteReply();
}
