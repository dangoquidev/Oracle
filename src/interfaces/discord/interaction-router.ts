import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type ChatInputCommandInteraction,
  type Interaction,
  type RepliableInteraction,
} from 'discord.js';
import type { GuildAccess } from '../../domain/guild/guild.js';
import { handleAdminAutocomplete, handleAdminCommand } from './commands/admin-command.js';
import { handleConfigureCommand } from './commands/configure-command.js';
import { handleMatchesCommand } from './commands/matches-command.js';
import { CONFIGURE_SCOPE, PREDICTION_SCOPE } from './components/custom-id.js';
import type { DiscordDependencies } from './dependencies.js';
import { handleConfigureInteraction } from './flows/configure-wizard-handler.js';
import { handlePredictionInteraction } from './flows/prediction-journey-handler.js';
import { localeFor, messages } from './i18n/index.js';

/** Single entry point for interactions: routing, the "not configured" gate and error reporting. */
export function createInteractionRouter(
  deps: DiscordDependencies,
): (interaction: Interaction) => Promise<void> {
  return async (interaction) => {
    try {
      await route(interaction, deps);
    } catch (error) {
      await reportFailure(interaction, error, deps);
    }
  };
}

type CommandHandler = (
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
) => Promise<void>;

/** Commands that require a configured server (everything but /configure). */
const GATED_COMMANDS: Readonly<Record<string, CommandHandler>> = {
  matches: handleMatchesCommand,
  admin: handleAdminCommand,
};

async function route(interaction: Interaction, deps: DiscordDependencies): Promise<void> {
  if (interaction.isAutocomplete()) {
    if (interaction.inCachedGuild() && interaction.commandName === 'admin')
      await handleAdminAutocomplete(interaction, deps);
    return;
  }
  if (!interaction.isRepliable()) return;
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: messages(localeFor(interaction.locale, null)).access.guildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'configure') {
      await handleConfigureCommand(interaction, deps);
      return;
    }
    const handler = GATED_COMMANDS[interaction.commandName];
    if (!handler || !(await passesAccessGate(interaction, deps))) return;
    await handler(interaction, deps);
    return;
  }

  if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) return;
  const scope = interaction.customId.split(':', 1)[0];

  if (scope === CONFIGURE_SCOPE) {
    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      await handleConfigureInteraction(interaction, deps);
    }
    return;
  }

  if (scope === PREDICTION_SCOPE && interaction.isButton()) {
    if (!(await passesAccessGate(interaction, deps))) return;
    await handlePredictionInteraction(interaction, deps);
  }
}

async function passesAccessGate(
  interaction: RepliableInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<boolean> {
  const access: GuildAccess = await deps.useCases.checkGuildAccess.execute(interaction.guildId);
  if (access === 'allowed') return true;
  const t = messages(localeFor(interaction.locale, null));
  await interaction.reply({
    content: access === 'paused' ? t.access.paused : t.access.unconfigured,
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

const IGNORED_ERRORS: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.UnknownInteraction, // token expired (> 3 s or 15 min): nothing left to answer
  RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged,
]);

async function reportFailure(
  interaction: Interaction,
  error: unknown,
  deps: DiscordDependencies,
): Promise<void> {
  if (error instanceof DiscordAPIError && IGNORED_ERRORS.has(error.code)) {
    deps.logger.debug(
      { interactionId: interaction.id, code: error.code },
      'Interaction could not be answered',
    );
    return;
  }
  deps.logger.error(
    { interactionId: interaction.id, guildId: interaction.guildId, err: error },
    'Interaction failed',
  );
  if (!interaction.isRepliable()) return;

  const t = messages(localeFor(interaction.locale, null));
  const content =
    error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.MissingPermissions
      ? t.errors.botMissingPermissions
      : t.errors.generic;
  try {
    if (interaction.deferred || interaction.replied)
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (replyError) {
    deps.logger.debug({ err: replyError }, 'Could not report the failure to the user');
  }
}
