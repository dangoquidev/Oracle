import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import type { WeekOffset } from '../../../domain/schedule/week-navigation.js';
import type { DiscordDependencies } from '../dependencies.js';
import { renderWeekMatches } from '../embeds/week-matches.js';
import { localeFor, messages } from '../i18n/index.js';

const WEEK_OFFSETS: Record<string, WeekOffset> = { previous: -1, current: 0, next: 1 };

export function matchesCommand(competitions: readonly Competition[]): SlashCommandBuilder {
  const fr = messages('fr').commands.matches;
  const en = messages('en').commands.matches;
  const command = new SlashCommandBuilder()
    .setName('matches')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setContexts(InteractionContextType.Guild);
  command.addStringOption((option) =>
    option
      .setName('week')
      .setNameLocalizations({ fr: 'semaine' })
      .setDescription(en.week)
      .setDescriptionLocalizations({ fr: fr.week })
      .addChoices(
        ...(['current', 'previous', 'next'] as const).map((value) => ({
          name: en.weekChoices[value],
          name_localizations: { fr: fr.weekChoices[value] },
          value,
        })),
      ),
  );
  command.addStringOption((option) =>
    option
      .setName('competition')
      .setDescription(en.competition)
      .setDescriptionLocalizations({ fr: fr.competition })
      .addChoices(...competitions.map((competition) => ({ name: competition.name, value: competition.id }))),
  );
  return command;
}

export async function handleMatchesCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const offset = WEEK_OFFSETS[interaction.options.getString('week') ?? 'current'] ?? 0;
  const competitionId = interaction.options.getString('competition');
  const result = await deps.useCases.listWeekMatches.execute(interaction.guildId, offset, competitionId);

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
    ...renderWeekMatches(result.value, locale, useEmojis),
    flags: MessageFlags.Ephemeral,
  });
}
