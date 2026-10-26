import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { LeaderboardPeriod } from '../../../application/use-cases/get-leaderboard.js';
import type { Competition } from '../../../domain/competition/competition.js';
import type { DiscordDependencies } from '../dependencies.js';
import { renderLeaderboard } from '../embeds/leaderboard.js';
import { localeFor, messages } from '../i18n/index.js';
import { addCompetitionOption } from './command-options.js';

const PERIODS: readonly LeaderboardPeriod[] = ['week', 'season', 'alltime'];
const MAX_CHOICES = 25;

export function leaderboardCommand(competitions: readonly Competition[]): SlashCommandBuilder {
  const fr = messages('fr').commands.leaderboard;
  const en = messages('en').commands.leaderboard;
  const command = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setContexts(InteractionContextType.Guild);
  command.addStringOption((option) =>
    option
      .setName('period')
      .setNameLocalizations({ fr: 'periode' })
      .setDescription(en.period)
      .setDescriptionLocalizations({ fr: fr.period })
      .addChoices(
        ...PERIODS.map((value) => ({
          name: en.periodChoices[value],
          name_localizations: { fr: fr.periodChoices[value] },
          value,
        })),
      ),
  );
  addCompetitionOption(command, competitions, { fr: fr.competition, en: en.competition });
  command.addIntegerOption((option) =>
    option
      .setName('season')
      .setNameLocalizations({ fr: 'saison' })
      .setDescription(en.season)
      .setDescriptionLocalizations({ fr: fr.season })
      .setAutocomplete(true),
  );
  return command;
}

/** Posted in the channel: a leaderboard is meant to be seen by everyone. */
export async function handleLeaderboardCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const period = interaction.options.getString('period') ?? 'season';
  const result = await deps.useCases.getLeaderboard.execute({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    period: isPeriod(period) ? period : 'season',
    competitionId: interaction.options.getString('competition'),
    seasonId: interaction.options.getInteger('season'),
  });

  if (!result.ok) {
    const t = messages(localeFor(interaction.locale, null));
    const content =
      result.error === 'season-not-found' ? t.leaderboard.seasonNotFound : t.access.unconfigured;
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    ...renderLeaderboard(result.value, result.value.locale),
    allowedMentions: { parse: [] },
  });
}

export async function handleLeaderboardAutocomplete(
  interaction: AutocompleteInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const seasons = await deps.useCases.listSeasons.execute(interaction.options.getString('competition'));
  const query = interaction.options.getFocused().toLowerCase();
  await interaction.respond(
    seasons
      .filter((season) => season.name.toLowerCase().includes(query))
      .slice(0, MAX_CHOICES)
      .map((season) => ({ name: season.name, value: season.id })),
  );
}

function isPeriod(value: string): value is LeaderboardPeriod {
  return (PERIODS as readonly string[]).includes(value);
}
