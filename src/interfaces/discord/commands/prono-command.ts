import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import type { DiscordDependencies } from '../dependencies.js';
import { renderRoundPredictions } from '../embeds/round-predictions.js';
import { localeFor, messages } from '../i18n/index.js';
import { addCompetitionOption } from './command-options.js';

export function pronoCommand(competitions: readonly Competition[]): SlashCommandBuilder {
  const fr = messages('fr').commands.prono;
  const en = messages('en').commands.prono;
  const command = new SlashCommandBuilder()
    .setName('prono')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setContexts(InteractionContextType.Guild);
  addCompetitionOption(command, competitions, { fr: fr.competition, en: en.competition });
  return command;
}

/** Posted in the channel for everyone to see, without pinging the players listed. */
export async function handlePronoCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const result = await deps.useCases.getRoundPredictions.execute(
    interaction.guildId,
    interaction.options.getString('competition'),
  );

  const locale = localeFor(interaction.locale, result.ok ? result.value.locale : null);
  if (!result.ok) {
    const t = messages(locale);
    const content =
      result.error === 'competition-not-enabled' ? t.matches.competitionNotEnabled : t.access.unconfigured;
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  const useEmojis = interaction.appPermissions.has(PermissionFlagsBits.UseExternalEmojis);
  await interaction.reply({
    ...renderRoundPredictions(result.value, result.value.locale, useEmojis),
    allowedMentions: { parse: [] },
  });
}
