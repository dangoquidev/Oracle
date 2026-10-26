import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { DiscordDependencies } from '../dependencies.js';
import { renderPlayerStats } from '../embeds/stats.js';
import { localeFor, messages } from '../i18n/index.js';

export function statsCommand(): SlashCommandBuilder {
  const fr = messages('fr').commands.stats;
  const en = messages('en').commands.stats;
  const command = new SlashCommandBuilder()
    .setName('stats')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setContexts(InteractionContextType.Guild);
  command.addUserOption((option) =>
    option
      .setName('user')
      .setNameLocalizations({ fr: 'joueur' })
      .setDescription(en.user)
      .setDescriptionLocalizations({ fr: fr.user }),
  );
  return command;
}

/** Posted in the channel like /leaderboard, without pinging the player. */
export async function handleStatsCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const user = interaction.options.getUser('user') ?? interaction.user;
  // A player who left the server has no member: fall back to their account name.
  const member = user.id === interaction.user.id ? interaction.member : interaction.options.getMember('user');
  const displayName = member?.displayName ?? user.displayName;
  if (user.bot) {
    const t = messages(localeFor(interaction.locale, null));
    await interaction.reply({ content: t.stats.bot, flags: MessageFlags.Ephemeral });
    return;
  }

  const result = await deps.useCases.getPlayerStats.execute(interaction.guildId, user.id);
  if (!result.ok) {
    const t = messages(localeFor(interaction.locale, null));
    await interaction.reply({ content: t.access.unconfigured, flags: MessageFlags.Ephemeral });
    return;
  }
  const useEmojis = interaction.appPermissions.has(PermissionFlagsBits.UseExternalEmojis);
  await interaction.reply({
    ...renderPlayerStats(result.value, displayName, result.value.locale, useEmojis),
    allowedMentions: { parse: [] },
  });
}
