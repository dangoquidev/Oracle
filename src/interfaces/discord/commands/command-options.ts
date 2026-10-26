import type { SlashCommandBuilder } from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import type { WeekOffset } from '../../../domain/schedule/week-navigation.js';
import { messages } from '../i18n/index.js';

const WEEK_OFFSETS: Readonly<Record<string, WeekOffset>> = { previous: -1, current: 0, next: 1 };

export function weekOffsetOf(value: string | null): WeekOffset {
  return WEEK_OFFSETS[value ?? 'current'] ?? 0;
}

/** Optional "week" option: current, previous or next week. */
export function addWeekOption(command: SlashCommandBuilder, description: { fr: string; en: string }): void {
  const fr = messages('fr').commands.matches.weekChoices;
  const en = messages('en').commands.matches.weekChoices;
  command.addStringOption((option) =>
    option
      .setName('week')
      .setNameLocalizations({ fr: 'semaine' })
      .setDescription(description.en)
      .setDescriptionLocalizations({ fr: description.fr })
      .addChoices(
        ...(['current', 'previous', 'next'] as const).map((value) => ({
          name: en[value],
          name_localizations: { fr: fr[value] },
          value,
        })),
      ),
  );
}

/** Optional "competition" option listing the catalog. */
export function addCompetitionOption(
  command: SlashCommandBuilder,
  competitions: readonly Competition[],
  description: { fr: string; en: string },
): void {
  command.addStringOption((option) =>
    option
      .setName('competition')
      .setDescription(description.en)
      .setDescriptionLocalizations({ fr: description.fr })
      .addChoices(...competitions.map((competition) => ({ name: competition.name, value: competition.id }))),
  );
}
