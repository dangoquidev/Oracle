import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import { LOCALES, type Locale, type RecapFrequency } from '../../../domain/guild/guild-settings.js';
import { isEmptyPatch, type SettingsPatch } from '../../../domain/guild/settings-patch.js';
import type { LockMode } from '../../../domain/lock/lock-policy.js';
import type { Weekday } from '../../../domain/schedule/publish-schedule.js';
import type { DiscordDependencies } from '../dependencies.js';
import {
  currentSettingMessage,
  renderSettings,
  settingsFailureMessage,
  settingUpdatedMessage,
} from '../embeds/settings.js';
import type { SettingsStep } from '../flows/configure-wizard.js';
import { COMMON_TIME_ZONES, LOCK_OFFSETS, REMINDER_OFFSETS } from '../flows/configure-wizard-view.js';
import { localeFor, messages } from '../i18n/index.js';

const MAX_CHOICES = 25;
const LOCK_MODES: readonly LockMode[] = ['per-day', 'per-match'];
const RECAP_FREQUENCIES: readonly RecapFrequency[] = ['daily', 'weekly'];
const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const ALL_TIME_ZONES = [...new Set([...COMMON_TIME_ZONES, ...Intl.supportedValuesOf('timeZone')])];

/** Each /config subcommand changes the setting of one wizard step. */
const STEP_OF = {
  channel: 'channel',
  role: 'role',
  timezone: 'timeZone',
  language: 'locale',
  lock: 'lock',
  reminders: 'reminders',
  recap: 'recap',
  publish: 'publish',
  competitions: 'competitions',
} as const satisfies Record<string, SettingsStep>;

export type SettingSubcommand = keyof typeof STEP_OF;
type Subcommand = 'show' | SettingSubcommand;

interface LocalizedOption {
  setName(name: string): unknown;
  setNameLocalizations(localizations: { fr: string }): unknown;
  setDescription(description: string): unknown;
  setDescriptionLocalizations(localizations: { fr: string }): unknown;
}

/** The options of a /config subcommand, read independently of discord.js. */
export interface ConfigOptions {
  string(name: string): string | null;
  integer(name: string): number | null;
  boolean(name: string): boolean | null;
  /** Id of a channel or role option. */
  id(name: string): string | null;
}

export function configCommand(competitions: readonly Competition[]): SlashCommandBuilder {
  const fr = messages('fr');
  const en = messages('en');
  const describe = (sub: SlashCommandSubcommandBuilder, name: Subcommand) =>
    sub
      .setName(name)
      .setDescription(en.commands.config[name])
      .setDescriptionLocalizations({ fr: fr.commands.config[name] });
  const option = <T extends LocalizedOption>(
    builder: T,
    name: string,
    frName: string | null,
    key: keyof typeof en.commands.config.options,
  ): T => {
    // Builders are mutated in place.
    builder.setName(name);
    builder.setDescription(en.commands.config.options[key]);
    builder.setDescriptionLocalizations({ fr: fr.commands.config.options[key] });
    if (frName) builder.setNameLocalizations({ fr: frName });
    return builder;
  };
  const offsetChoices = (offsets: readonly number[]) =>
    offsets.map((minutes) => ({
      name: en.configure.offset(minutes),
      name_localizations: { fr: fr.configure.offset(minutes) },
      value: minutes,
    }));

  const command = new SlashCommandBuilder()
    .setName('config')
    .setDescription(en.commands.config.description)
    .setDescriptionLocalizations({ fr: fr.commands.config.description })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild);

  command.addSubcommand((sub) => describe(sub, 'show'));
  command.addSubcommand((sub) =>
    describe(sub, 'channel').addChannelOption((o) =>
      option(o, 'channel', 'salon', 'channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    ),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'role').addRoleOption((o) => option(o, 'role', null, 'role').setRequired(true)),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'timezone').addStringOption((o) =>
      option(o, 'timezone', 'fuseau', 'timezone').setRequired(true).setAutocomplete(true),
    ),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'language').addStringOption((o) =>
      option(o, 'language', 'langue', 'language')
        .setRequired(true)
        .addChoices(...LOCALES.map((locale) => ({ name: en.configure.localeNames[locale], value: locale }))),
    ),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'lock')
      .addStringOption((o) =>
        option(o, 'mode', null, 'mode').addChoices(
          ...LOCK_MODES.map((mode) => ({
            name: en.configure.lockMode[mode],
            name_localizations: { fr: fr.configure.lockMode[mode] },
            value: mode,
          })),
        ),
      )
      .addIntegerOption((o) =>
        option(o, 'delay', 'delai', 'lockDelay').addChoices(...offsetChoices(LOCK_OFFSETS)),
      ),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'reminders')
      .addBooleanOption((o) => option(o, 'enabled', 'actifs', 'enabled'))
      .addIntegerOption((o) =>
        option(o, 'delay', 'delai', 'reminderDelay').addChoices(...offsetChoices(REMINDER_OFFSETS)),
      ),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'recap').addStringOption((o) =>
      option(o, 'frequency', 'frequence', 'frequency')
        .setRequired(true)
        .addChoices(
          ...RECAP_FREQUENCIES.map((frequency) => ({
            name: en.configure.recap[frequency],
            name_localizations: { fr: fr.configure.recap[frequency] },
            value: frequency,
          })),
        ),
    ),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'publish')
      .addIntegerOption((o) =>
        option(o, 'day', 'jour', 'day').addChoices(
          ...WEEKDAYS.map((weekday) => ({
            name: en.weekday[weekday],
            name_localizations: { fr: fr.weekday[weekday] },
            value: weekday,
          })),
        ),
      )
      .addIntegerOption((o) => option(o, 'hour', 'heure', 'hour').setMinValue(0).setMaxValue(23))
      .addIntegerOption((o) => option(o, 'minute', null, 'minute').setMinValue(0).setMaxValue(59)),
  );
  command.addSubcommand((sub) =>
    describe(sub, 'competitions')
      .addStringOption((o) =>
        option(o, 'competition', null, 'competition')
          .setRequired(true)
          .addChoices(
            ...competitions.map((competition) => ({ name: competition.name, value: competition.id })),
          ),
      )
      .addBooleanOption((o) => option(o, 'enabled', 'active', 'competitionEnabled').setRequired(true)),
  );
  return command;
}

/** Turns the options of a subcommand into a settings change; unknown values are left out. */
export function patchFor(subcommand: SettingSubcommand, options: ConfigOptions): SettingsPatch {
  switch (subcommand) {
    case 'channel':
      return compact({ channelId: options.id('channel') });
    case 'role':
      return compact({ pingRoleId: options.id('role') });
    case 'timezone':
      return compact({ timeZone: options.string('timezone')?.trim() ?? null });
    case 'language':
      return compact({ locale: oneOf(LOCALES, options.string('language')) });
    case 'recap':
      return compact({ recapFrequency: oneOf(RECAP_FREQUENCIES, options.string('frequency')) });
    case 'lock':
      return {
        lock: compact({
          mode: oneOf(LOCK_MODES, options.string('mode')),
          offsetMinutes: options.integer('delay'),
        }),
      };
    case 'reminders':
      return {
        reminders: compact({ enabled: options.boolean('enabled'), offsetMinutes: options.integer('delay') }),
      };
    case 'publish':
      return {
        publish: compact({
          weekday: oneOf(WEEKDAYS, options.integer('day')),
          hour: options.integer('hour'),
          minute: options.integer('minute'),
        }),
      };
    case 'competitions': {
      const id = options.string('competition');
      const enabled = options.boolean('enabled');
      return id !== null && enabled !== null ? { competition: { id, enabled } } : {};
    }
  }
}

export async function handleConfigCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const t = messages(localeFor(interaction.locale, null));
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await reply(interaction, t.access.adminOnly);
    return;
  }

  const subcommand = interaction.options.getSubcommand() as Subcommand;
  const guild = await deps.useCases.getGuildSettings.execute(interaction.guildId);
  if (!guild) {
    await reply(interaction, t.config.unconfigured);
    return;
  }
  const local = messages(localeFor(interaction.locale, guild.settings.locale));
  if (subcommand === 'show') {
    await interaction.reply({
      ...renderSettings(guild, deps.competitions, local),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const step = STEP_OF[subcommand];
  const patch = patchFor(subcommand, optionsOf(interaction));
  if (isEmptyPatch(patch)) {
    await reply(interaction, currentSettingMessage(step, guild, deps.competitions, local));
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await deps.useCases.updateGuildSettings.execute(interaction.guildId, patch);
  if (!result.ok) {
    await interaction.editReply(
      result.error.kind === 'not-configured'
        ? local.config.unconfigured
        : settingsFailureMessage(result.error, local),
    );
    return;
  }
  const updated = messages(localeFor(interaction.locale, result.value.settings.locale));
  await interaction.editReply(settingUpdatedMessage(step, result.value, deps.competitions, updated));
}

export async function handleConfigAutocomplete(
  interaction: AutocompleteInteraction<'cached'>,
): Promise<void> {
  const query = interaction.options.getFocused().trim().toLowerCase();
  const zones =
    query === '' ? COMMON_TIME_ZONES : ALL_TIME_ZONES.filter((zone) => zone.toLowerCase().includes(query));
  await interaction.respond(zones.slice(0, MAX_CHOICES).map((zone) => ({ name: zone, value: zone })));
}

function optionsOf(interaction: ChatInputCommandInteraction<'cached'>): ConfigOptions {
  const { options } = interaction;
  return {
    string: (name) => options.getString(name),
    integer: (name) => options.getInteger(name),
    boolean: (name) => options.getBoolean(name),
    id: (name) => options.get(name)?.value?.toString() ?? null,
  };
}

function oneOf<T extends string | number>(values: readonly T[], raw: string | number | null): T | null {
  return values.find((value) => value === raw) ?? null;
}

/** Drops the options that were not given. */
function compact<T extends object>(values: { [K in keyof T]: T[K] | null }): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)) as Partial<T>;
}

async function reply(interaction: ChatInputCommandInteraction<'cached'>, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

export type { Locale };
