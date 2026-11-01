import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import type { DiscordDependencies } from '../dependencies.js';
import { renderWeekMatches } from '../embeds/week-matches.js';
import { localeFor, messages } from '../i18n/index.js';
import { postInChannel } from '../public-message.js';
import { addCompetitionOption, addWeekOption, weekOffsetOf } from './command-options.js';

export function matchesCommand(competitions: readonly Competition[]): SlashCommandBuilder {
  const fr = messages('fr').commands.matches;
  const en = messages('en').commands.matches;
  const command = new SlashCommandBuilder()
    .setName('matches')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setContexts(InteractionContextType.Guild);
  addWeekOption(command, { fr: fr.week, en: en.week });
  addCompetitionOption(command, competitions, { fr: fr.competition, en: en.competition });
  return command;
}

/** Posted in the channel as a bot message, for everyone to see. */
export async function handleMatchesCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const offset = weekOffsetOf(interaction.options.getString('week'));
  const competitionId = interaction.options.getString('competition');
  const result = await deps.useCases.listWeekMatches.execute(interaction.guildId, offset, competitionId);

  if (!result.ok) {
    const t = messages(localeFor(interaction.locale, null));
    const content =
      result.error === 'competition-not-enabled' ? t.matches.competitionNotEnabled : t.access.unconfigured;
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  const useEmojis = interaction.appPermissions.has(PermissionFlagsBits.UseExternalEmojis);
  await postInChannel(interaction, renderWeekMatches(result.value, result.value.locale, useEmojis));
}
