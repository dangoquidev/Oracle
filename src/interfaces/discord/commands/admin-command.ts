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
import type { MatchView } from '../../../application/read-models/views.js';
import type { ResultDecision } from '../../../application/use-cases/admin-results.js';
import type { LockTargets, TargetScope } from '../../../application/use-cases/list-lock-targets.js';
import type { LockTarget } from '../../../application/use-cases/set-lock-override.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import type { MatchResult } from '../../../domain/match/match.js';
import { winnerOfScore } from '../../../domain/match/series-score.js';
import { choicesFor, type PredictionChoice } from '../../../domain/prediction/prediction-choice.js';
import { decodeChoice, encodeChoice } from '../components/custom-id.js';
import type { DiscordDependencies } from '../dependencies.js';
import { resultLabel, shortName, truncate } from '../embeds/formatting.js';
import { localeFor, messages, type Messages } from '../i18n/index.js';

const MAX_CHOICES = 25;
const PROVIDER_RESULT = 'provider';

interface Choice {
  name: string;
  value: string;
}
type Subcommand = 'open' | 'close' | 'result' | 'cancel' | 'recalc';

export function adminCommand(): SlashCommandBuilder {
  const fr = messages('fr').commands.admin;
  const en = messages('en').commands.admin;
  const describe = (sub: SlashCommandSubcommandBuilder, name: Subcommand) =>
    sub.setName(name).setDescription(en[name]).setDescriptionLocalizations({ fr: fr[name] });
  const matchOption = (sub: SlashCommandSubcommandBuilder, required: boolean) =>
    sub.addStringOption((option) =>
      option
        .setName('match')
        .setDescription(en.match)
        .setDescriptionLocalizations({ fr: fr.match })
        .setRequired(required)
        .setAutocomplete(true),
    );
  const lockTargets = (sub: SlashCommandSubcommandBuilder) =>
    matchOption(
      sub.addStringOption((option) =>
        option
          .setName('week')
          .setNameLocalizations({ fr: 'semaine' })
          .setDescription(en.week)
          .setDescriptionLocalizations({ fr: fr.week })
          .setAutocomplete(true),
      ),
      false,
    );

  const command = new SlashCommandBuilder()
    .setName('admin')
    .setDescription(en.description)
    .setDescriptionLocalizations({ fr: fr.description })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild);
  command.addSubcommand((sub) => lockTargets(describe(sub, 'open')));
  command.addSubcommand((sub) => lockTargets(describe(sub, 'close')));
  command.addSubcommand((sub) =>
    matchOption(describe(sub, 'result'), true).addStringOption((option) =>
      option
        .setName('score')
        .setNameLocalizations({ fr: 'resultat' })
        .setDescription(en.score)
        .setDescriptionLocalizations({ fr: fr.score })
        .setRequired(true)
        .setAutocomplete(true),
    ),
  );
  command.addSubcommand((sub) =>
    matchOption(describe(sub, 'cancel'), true).addBooleanOption((option) =>
      option
        .setName('restore')
        .setNameLocalizations({ fr: 'restaurer' })
        .setDescription(en.restore)
        .setDescriptionLocalizations({ fr: fr.restore }),
    ),
  );
  command.addSubcommand((sub) => describe(sub, 'recalc'));
  return command;
}

export async function handleAdminCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const t = messages(localeFor(interaction.locale, null));
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await reply(interaction, t.access.adminOnly);
    return;
  }

  const subcommand = interaction.options.getSubcommand() as Subcommand;
  switch (subcommand) {
    case 'open':
    case 'close':
      await handleLock(interaction, deps, t, subcommand);
      return;
    case 'result':
    case 'cancel':
      await handleResult(interaction, deps, t, subcommand);
      return;
    case 'recalc': {
      const result = await deps.useCases.recalculatePoints.execute(interaction.guildId);
      await reply(interaction, result.ok ? t.admin.recalculated(result.value) : t.access.unconfigured);
      return;
    }
  }
}

async function handleLock(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
  t: Messages,
  subcommand: 'open' | 'close',
): Promise<void> {
  const target = targetOf(interaction.options.getString('week'), interaction.options.getString('match'));
  if (target === 'missing' || target === 'both') {
    await reply(interaction, target === 'missing' ? t.admin.missingTarget : t.admin.bothTargets);
    return;
  }
  const state = subcommand === 'open' ? 'open' : 'closed';
  const result = await deps.useCases.setLockOverride.execute({
    guildId: interaction.guildId,
    adminId: interaction.user.id,
    target,
    state,
  });
  if (!result.ok) {
    await reply(interaction, t.admin.errors[result.error]);
    return;
  }
  const { competitionName, weekName, matches } = result.value;
  const label = `${competitionName} · ${weekName}`;
  await reply(
    interaction,
    state === 'open' ? t.admin.opened(matches.length, label) : t.admin.closed(matches.length, label),
  );
}

async function handleResult(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
  t: Messages,
  subcommand: 'result' | 'cancel',
): Promise<void> {
  const matchId = toId(interaction.options.getString('match', true));
  if (matchId === null) {
    await reply(interaction, t.admin.errors['match-not-found']);
    return;
  }

  let decision: ResultDecision;
  if (subcommand === 'cancel') {
    decision = interaction.options.getBoolean('restore') ? { kind: 'provider' } : { kind: 'cancel' };
  } else {
    const raw = interaction.options.getString('score', true);
    const choice = decodeChoice(raw);
    if (raw !== PROVIDER_RESULT && !choice) {
      await reply(interaction, t.admin.invalidScore);
      return;
    }
    decision = choice ? { kind: 'result', result: resultOf(choice) } : { kind: 'provider' };
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const outcome = await deps.useCases.decideMatchResult.execute(
    interaction.guildId,
    interaction.user.id,
    matchId,
    decision,
  );
  if (!outcome.ok) {
    await interaction.editReply(t.admin.errors[outcome.error]);
    return;
  }
  const { match, rescored } = outcome.value;
  const label = `${shortName(match.team1, t)} vs ${shortName(match.team2, t)}`;
  const content =
    decision.kind === 'result'
      ? t.admin.resultSaved(label, resultLabel(decision.result, match, t), rescored)
      : decision.kind === 'cancel'
        ? t.admin.cancelled(label, rescored)
        : t.admin.resultRestored(label, rescored);
  await interaction.editReply(content);
}

export async function handleAdminAutocomplete(
  interaction: AutocompleteInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand() as Subcommand;
  const focused = interaction.options.getFocused(true);
  const locale = localeFor(interaction.locale, null);
  const t = messages(locale);

  let choices: Choice[];
  if (focused.name === 'week') {
    choices = weekChoices(await deps.useCases.listLockTargets.execute(interaction.guildId, 'upcoming'));
  } else if (focused.name === 'match') {
    const scopes: TargetScope[] =
      subcommand === 'result' ? ['recent'] : subcommand === 'cancel' ? ['recent', 'upcoming'] : ['upcoming'];
    choices = [];
    for (const scope of scopes) {
      choices.push(
        ...matchChoices(await deps.useCases.listLockTargets.execute(interaction.guildId, scope), locale),
      );
    }
  } else {
    const match = await findRecentMatch(interaction, deps);
    choices = match ? scoreChoices(match, t) : [];
  }

  const query = focused.value.toLowerCase();
  await interaction.respond(
    choices.filter((choice) => choice.name.toLowerCase().includes(query)).slice(0, MAX_CHOICES),
  );
}

async function findRecentMatch(
  interaction: AutocompleteInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<MatchView | null> {
  const matchId = toId(interaction.options.getString('match'));
  if (matchId === null) return null;
  const targets = await deps.useCases.listLockTargets.execute(interaction.guildId, 'recent');
  return targets.weeks.flatMap((week) => week.matches).find((match) => match.id === matchId) ?? null;
}

function scoreChoices(match: MatchView, t: Messages): Choice[] {
  return [
    { name: t.admin.providerResult, value: PROVIDER_RESULT },
    ...choicesFor(match.bestOf).map((choice) => ({
      name: resultLabel(resultOf(choice), match, t),
      value: encodeChoice(choice),
    })),
  ];
}

function resultOf(choice: PredictionChoice): MatchResult {
  return choice.kind === 'winner'
    ? { winner: choice.winner, score: null }
    : { winner: winnerOfScore(choice.score), score: choice.score };
}

function targetOf(week: string | null, match: string | null): LockTarget | 'missing' | 'both' {
  if (week && match) return 'both';
  const weekId = toId(week);
  if (weekId !== null) return { kind: 'week', weekId };
  const matchId = toId(match);
  if (matchId !== null) return { kind: 'match', matchId };
  return 'missing';
}

function toId(raw: string | null): number | null {
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function weekChoices(targets: LockTargets): Choice[] {
  return targets.weeks.map(({ week, competitionName, matches }) => ({
    name: truncate(`${competitionName} · ${week.name} · ${matches.length} match(s)`, 100),
    value: String(week.id),
  }));
}

function matchChoices(targets: LockTargets, locale: Locale): Choice[] {
  const t = messages(locale);
  return targets.weeks.flatMap(({ week, competitionName, matches }) =>
    matches.map((match) => {
      const when = DateTime.fromJSDate(match.scheduledAt, { zone: targets.timeZone })
        .setLocale(locale)
        .toFormat('ccc d LLL HH:mm');
      const teams = `${shortName(match.team1, t)} vs ${shortName(match.team2, t)}`;
      return {
        name: truncate(`${teams} · ${competitionName} ${week.name} · ${when}`, 100),
        value: String(match.id),
      };
    }),
  );
}

async function reply(interaction: ChatInputCommandInteraction<'cached'>, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
