import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { startWizard } from '../flows/configure-wizard.js';
import { renderWizard } from '../flows/configure-wizard-view.js';
import type { DiscordDependencies } from '../dependencies.js';
import { messages, supportedLocale } from '../i18n/index.js';

export const configureCommand = new SlashCommandBuilder()
  .setName('configure')
  .setDescription(messages('en').commands.configure.description)
  .setDescriptionLocalizations({ fr: messages('fr').commands.configure.description })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild);

/** Opens the setup wizard, prefilled with the current settings or the defaults. */
export async function handleConfigureCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const draft = await deps.useCases.getConfigurationDraft.execute(interaction.guildId);
  const userLocale = supportedLocale(interaction.locale);
  const isFirstSetup = draft.pingRoleId === undefined;
  if (isFirstSetup && userLocale) draft.locale = userLocale;

  const channel = interaction.channel;
  const invokedFrom =
    channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
      ? channel.id
      : null;
  const state = startWizard(draft, invokedFrom);
  deps.wizardSessions.set(interaction.guildId, interaction.user.id, state);

  await interaction.reply({ ...renderWizard(state, deps), flags: MessageFlags.Ephemeral });
}
