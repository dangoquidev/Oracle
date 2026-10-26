import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import type { DiscordDependencies } from '../dependencies.js';
import { renderMyPredictions } from '../embeds/my-predictions.js';
import { localeFor, messages } from '../i18n/index.js';
import { addCompetitionOption, addWeekOption, weekOffsetOf } from './command-options.js';

export function myPredictionsCommand(competitions: readonly Competition[]): SlashCommandBuilder {
  const fr = messages('fr').commands.mypronos;
  const en = messages('en').commands.mypronos;
  const command = new SlashCommandBuilder()
    .setName('mypronos')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setContexts(InteractionContextType.Guild);
  addWeekOption(command, { fr: fr.week, en: en.week });
  addCompetitionOption(command, competitions, { fr: fr.competition, en: en.competition });
  return command;
}

export async function handleMyPredictionsCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const result = await deps.useCases.getMyPredictions.execute(
    interaction.guildId,
    interaction.user.id,
    weekOffsetOf(interaction.options.getString('week')),
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
    ...renderMyPredictions(result.value, locale, useEmojis),
    flags: MessageFlags.Ephemeral,
  });
}
