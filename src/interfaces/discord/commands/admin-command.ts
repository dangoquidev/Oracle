import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { DateTime } from 'luxon';
import type { LockTargets } from '../../../application/use-cases/list-lock-targets.js';
import type { LockTarget } from '../../../application/use-cases/set-lock-override.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import type { DiscordDependencies } from '../dependencies.js';
import { truncate } from '../embeds/formatting.js';
import { localeFor, messages } from '../i18n/index.js';

const MAX_CHOICES = 25;

export function adminCommand(): SlashCommandBuilder {
  const fr = messages('fr').commands.admin;
  const en = messages('en').commands.admin;
  const withTargets = (sub: SlashCommandSubcommandBuilder) =>
    sub
      .addStringOption((option) =>
        option
          .setName('week')
          .setNameLocalizations({ fr: 'semaine' })
          .setDescription(en.week)
          .setDescriptionLocalizations({ fr: fr.week })
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName('match')
          .setDescription(en.match)
          .setDescriptionLocalizations({ fr: fr.match })
          .setAutocomplete(true),
      );

  const command = new SlashCommandBuilder()
    .setName('admin')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild);
  command.addSubcommand((sub) =>
    withTargets(sub.setName('open').setDescription(en.open).setDescriptionLocalizations({ fr: fr.open })),
  );
  command.addSubcommand((sub) =>
    withTargets(sub.setName('close').setDescription(en.close).setDescriptionLocalizations({ fr: fr.close })),
  );
  return command;
}

export async function handleAdminCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const t = messages(localeFor(interaction.locale, null));
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: t.access.adminOnly, flags: MessageFlags.Ephemeral });
    return;
  }

  const target = targetOf(interaction.options.getString('week'), interaction.options.getString('match'));
  if (target === 'missing' || target === 'both') {
    await interaction.reply({
      content: target === 'missing' ? t.admin.missingTarget : t.admin.bothTargets,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const state = interaction.options.getSubcommand() === 'open' ? 'open' : 'closed';
  const result = await deps.useCases.setLockOverride.execute({
    guildId: interaction.guildId,
    adminId: interaction.user.id,
    target,
    state,
  });
  if (!result.ok) {
    await interaction.reply({ content: t.admin.errors[result.error], flags: MessageFlags.Ephemeral });
    return;
  }
  const { competitionName, weekName, matches } = result.value;
  const label = `${competitionName} · ${weekName}`;
  await interaction.reply({
    content: state === 'open' ? t.admin.opened(matches.length, label) : t.admin.closed(matches.length, label),
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleAdminAutocomplete(
  interaction: AutocompleteInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const targets = await deps.useCases.listLockTargets.execute(interaction.guildId);
  const locale = localeFor(interaction.locale, null);
  const choices = focused.name === 'week' ? weekChoices(targets) : matchChoices(targets, locale);
  const query = focused.value.toLowerCase();
  await interaction.respond(
    choices.filter((choice) => choice.name.toLowerCase().includes(query)).slice(0, MAX_CHOICES),
  );
}

function targetOf(week: string | null, match: string | null): LockTarget | 'missing' | 'both' {
  if (week && match) return 'both';
  const weekId = Number(week);
  if (week && Number.isSafeInteger(weekId)) return { kind: 'week', weekId };
  const matchId = Number(match);
  if (match && Number.isSafeInteger(matchId)) return { kind: 'match', matchId };
  return 'missing';
}

function weekChoices(targets: LockTargets): { name: string; value: string }[] {
  return targets.weeks.map(({ week, competitionName, matches }) => ({
    name: truncate(`${competitionName} · ${week.name} · ${matches.length} match(s)`, 100),
    value: String(week.id),
  }));
}

function matchChoices(targets: LockTargets, locale: Locale): { name: string; value: string }[] {
  const t = messages(locale);
  return targets.weeks.flatMap(({ week, competitionName, matches }) =>
    matches.map((match) => {
      const when = DateTime.fromJSDate(match.scheduledAt, { zone: targets.timeZone })
        .setLocale(locale)
        .toFormat('ccc d LLL HH:mm');
      const teams = `${match.team1?.shortName ?? t.common.unknownTeam} vs ${match.team2?.shortName ?? t.common.unknownTeam}`;
      return {
        name: truncate(`${teams} · ${competitionName} ${week.name} · ${when}`, 100),
        value: String(match.id),
      };
    }),
  );
}
