import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { Weekday } from '../../../domain/schedule/publish-schedule.js';
import type { GuildSettingsDraft } from '../../../domain/guild/guild-settings.js';
import { isValidTimeZone } from '../../../domain/shared/time-zone.js';
import { decodeConfigure } from '../components/custom-id.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import type { DiscordDependencies } from '../dependencies.js';
import { localeFor, messages } from '../i18n/index.js';
import { defaultSettings } from '../../../domain/guild/guild-settings.js';
import { keepDefault, next, previous, update, withNotice, type WizardState } from './configure-wizard.js';
import { renderTimeZoneModal, renderWizard, wizardLocale } from './configure-wizard-view.js';

type WizardInteraction =
  ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>;

export async function handleConfigureInteraction(
  interaction: WizardInteraction,
  deps: DiscordDependencies,
): Promise<void> {
  const decoded = decodeConfigure(interaction.customId);
  if (!decoded) return;

  const fallbackT = messages(localeFor(interaction.locale, null));
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: fallbackT.access.adminOnly, flags: MessageFlags.Ephemeral });
    return;
  }

  const state = deps.wizardSessions.get(interaction.guildId, interaction.user.id);
  if (!state) {
    await respond(interaction, { content: fallbackT.errors.expired, embeds: [], components: [] });
    return;
  }

  if (decoded.action === 'tzother' && interaction.isButton()) {
    await interaction.showModal(renderTimeZoneModal(wizardLocale(state)));
    return;
  }

  if (decoded.action === 'nav' && decoded.arg === 'cancel') {
    deps.wizardSessions.delete(interaction.guildId, interaction.user.id);
    await respond(interaction, {
      content: messages(wizardLocale(state)).configure.cancelled,
      embeds: [],
      components: [],
    });
    return;
  }

  if (decoded.action === 'nav' && decoded.arg === 'confirm') {
    await confirm(interaction, state, deps);
    return;
  }

  const nextState = reduce(state, decoded.action, decoded.arg, interaction, deps);
  deps.wizardSessions.set(interaction.guildId, interaction.user.id, nextState);
  await respond(interaction, renderWizard(nextState, deps));
}

function reduce(
  state: WizardState,
  action: string,
  arg: string | null,
  interaction: WizardInteraction,
  deps: DiscordDependencies,
): WizardState {
  const values = interaction.isAnySelectMenu() ? interaction.values : [];
  const [first] = values;
  const fallback = defaultSettings(deps.competitions.map((competition) => competition.id));
  const patch = (value: GuildSettingsDraft) => update(state, value);

  switch (action) {
    case 'nav':
      if (arg === 'next') return next(state);
      if (arg === 'prev') return previous(state);
      if (arg === 'default') return keepDefault(state, deps.competitions);
      return state;
    case 'locale':
      return arg === 'fr' || arg === 'en' ? patch({ locale: arg }) : state;
    case 'role':
      return first ? patch({ pingRoleId: first }) : state;
    case 'channel':
      return first ? patch({ channelId: first }) : state;
    case 'competitions':
      return values.length > 0 ? patch({ competitionIds: [...values] }) : state;
    case 'tz':
      return first ? patch({ timeZone: first }) : state;
    case 'tzmodal': {
      const value = interaction.isModalSubmit()
        ? interaction.fields.getTextInputValue('timeZone').trim()
        : '';
      return isValidTimeZone(value)
        ? patch({ timeZone: value })
        : withNotice(state, messages(wizardLocale(state)).configure.invalidTimeZone(value));
    }
    case 'weekday':
      return first
        ? patch({
            publish: { ...(state.draft.publish ?? fallback.publish), weekday: Number(first) as Weekday },
          })
        : state;
    case 'hour':
      return first
        ? patch({ publish: { ...(state.draft.publish ?? fallback.publish), hour: Number(first), minute: 0 } })
        : state;
    case 'lockmode':
      return arg === 'per-day' || arg === 'per-match'
        ? patch({ lock: { ...(state.draft.lock ?? fallback.lock), mode: arg } })
        : state;
    case 'lockoffset':
      return first
        ? patch({ lock: { ...(state.draft.lock ?? fallback.lock), offsetMinutes: Number(first) } })
        : state;
    case 'recap':
      return arg === 'daily' || arg === 'weekly' ? patch({ recapFrequency: arg }) : state;
    case 'reminders':
      return arg === 'on' || arg === 'off'
        ? patch({ reminders: { ...(state.draft.reminders ?? fallback.reminders), enabled: arg === 'on' } })
        : state;
    case 'reminderoffset':
      return first
        ? patch({
            reminders: { ...(state.draft.reminders ?? fallback.reminders), offsetMinutes: Number(first) },
          })
        : state;
    default:
      return state;
  }
}

async function confirm(
  interaction: WizardInteraction,
  state: WizardState,
  deps: DiscordDependencies,
): Promise<void> {
  const t = messages(wizardLocale(state));
  await deferUpdate(interaction);
  const result = await deps.useCases.configureGuild.execute(interaction.guildId, state.draft);

  if (result.ok) {
    deps.wizardSessions.delete(interaction.guildId, interaction.user.id);
    const lines = [
      t.configure.saved,
      ...result.value.warnings.map((warning) => t.configure.warnings[warning]),
    ];
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(BRAND_COLOR).setDescription(lines.join('\n\n'))],
      components: [],
    });
    return;
  }

  const notice =
    result.error.kind === 'invalid-settings'
      ? [
          t.configure.invalid,
          ...result.error.errors.map((error) => `• ${t.configure.settingsErrors[error]}`),
        ].join('\n')
      : [
          t.configure.missingPermissions,
          ...result.error.issues.map((issue) => `• ${t.configure.issues[issue]}`),
        ].join('\n');
  const nextState = withNotice(state, notice);
  deps.wizardSessions.set(interaction.guildId, interaction.user.id, nextState);
  await interaction.editReply(renderWizard(nextState, deps));
}

async function respond(interaction: WizardInteraction, view: MessageView): Promise<void> {
  if (interaction.isModalSubmit()) {
    if (interaction.isFromMessage()) await interaction.update(view);
    else await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.update(view);
}

async function deferUpdate(interaction: WizardInteraction): Promise<void> {
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
}
