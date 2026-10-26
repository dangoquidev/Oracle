import { EmbedBuilder } from 'discord.js';
import type { ConfigureGuildError } from '../../../application/use-cases/configure-guild.js';
import type {
  ConfiguredGuild,
  SettingsUpdate,
} from '../../../application/use-cases/update-guild-settings.js';
import type { Competition } from '../../../domain/competition/competition.js';
import { BRAND_COLOR, WARNING_COLOR, type MessageView } from '../components/payload.js';
import { WIZARD_STEPS, type SettingsStep } from '../flows/configure-wizard.js';
import { describeSetting } from '../flows/configure-wizard-view.js';
import type { Messages } from '../i18n/index.js';

const SETTINGS_STEPS = WIZARD_STEPS.filter((step): step is SettingsStep => step !== 'summary');

/** /config show: every setting and whether the bot is running. */
export function renderSettings(
  guild: ConfiguredGuild,
  competitions: readonly Competition[],
  t: Messages,
): MessageView {
  const paused = guild.status === 'paused';
  const status = paused
    ? [t.config.paused(guild.pauseReason ? t.pause[guild.pauseReason] : ''), t.config.pausedHint].join('\n')
    : t.config.active;
  const embed = new EmbedBuilder()
    .setColor(paused ? WARNING_COLOR : BRAND_COLOR)
    .setTitle(t.config.title)
    .addFields(
      { name: t.config.status, value: status },
      ...SETTINGS_STEPS.map((step) => ({
        name: t.configure.labels[step],
        value: describeSetting(step, guild.settings, { competitions }, t),
        inline: true,
      })),
    )
    .setFooter({ text: t.config.footer });
  return { embeds: [embed], components: [] };
}

/** Confirmation of a /config change, with what the bot noticed while checking it. */
export function settingUpdatedMessage(
  step: SettingsStep,
  update: SettingsUpdate,
  competitions: readonly Competition[],
  t: Messages,
): string {
  return [
    `${t.config.updated} · **${t.configure.labels[step]}** : ${describeSetting(step, update.settings, { competitions }, t)}`,
    ...(update.reactivated ? [t.config.reactivated] : []),
    ...update.warnings.map((warning) => t.configure.warnings[warning]),
  ].join('\n\n');
}

export function currentSettingMessage(
  step: SettingsStep,
  guild: ConfiguredGuild,
  competitions: readonly Competition[],
  t: Messages,
): string {
  const value = describeSetting(step, guild.settings, { competitions }, t);
  return `**${t.configure.labels[step]}** · ${t.config.current} : ${value}\n-# ${t.config.nothingToChange}`;
}

/** Why settings could not be saved, shared by the wizard and /config. */
export function settingsFailureMessage(error: ConfigureGuildError, t: Messages): string {
  return error.kind === 'invalid-settings'
    ? [t.configure.invalid, ...error.errors.map((item) => `• ${t.configure.settingsErrors[item]}`)].join('\n')
    : [t.configure.missingPermissions, ...error.issues.map((issue) => `• ${t.configure.issues[issue]}`)].join(
        '\n',
      );
}
