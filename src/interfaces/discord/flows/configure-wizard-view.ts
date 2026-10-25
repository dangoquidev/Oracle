import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  channelMention,
  EmbedBuilder,
  LabelBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  roleMention,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import {
  defaultSettings,
  type GuildSettingsDraft,
  type Locale,
} from '../../../domain/guild/guild-settings.js';
import type { Weekday } from '../../../domain/schedule/publish-schedule.js';
import { encodeConfigure } from '../components/custom-id.js';
import { BRAND_COLOR, WARNING_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import {
  canAdvance,
  currentStep,
  defaultPatchFor,
  totalSettingsSteps,
  WIZARD_STEPS,
  type SettingsStep,
  type WizardState,
} from './configure-wizard.js';

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

export const COMMON_TIME_ZONES = [
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Luxembourg',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Istanbul',
  'Africa/Casablanca',
  'Africa/Algiers',
  'Africa/Tunis',
  'Africa/Dakar',
  'Africa/Abidjan',
  'Indian/Reunion',
  'America/Martinique',
  'America/Guadeloupe',
  'America/Toronto',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Seoul',
  'UTC',
] as const;

export const LOCK_OFFSETS = [0, 15, 30, 60, 90, 120, 180, 240, 360, 720, 1440] as const;
export const REMINDER_OFFSETS = [15, 30, 60, 120, 180, 360, 720, 1440] as const;

export interface WizardViewContext {
  readonly competitions: readonly Competition[];
}

export function wizardLocale(state: WizardState): Locale {
  return state.draft.locale ?? 'fr';
}

export function renderWizard(state: WizardState, context: WizardViewContext): MessageView {
  const t = messages(wizardLocale(state));
  const step = currentStep(state);
  const stepText = t.configure.steps[step];
  const position = Math.min(state.stepIndex + 1, totalSettingsSteps());

  const embed = new EmbedBuilder()
    .setColor(state.notice ? WARNING_COLOR : BRAND_COLOR)
    .setTitle(
      step === 'summary'
        ? t.configure.steps.summary.name
        : t.configure.title(position, totalSettingsSteps(), stepText.name),
    );

  if (step === 'summary') {
    embed.setDescription(stepText.help).addFields(
      WIZARD_STEPS.filter((s): s is SettingsStep => s !== 'summary').map((s) => ({
        name: t.configure.labels[s],
        value: describeSetting(s, state.draft, context, t),
        inline: true,
      })),
    );
  } else {
    embed.setDescription(
      `${stepText.help}\n\n**${t.configure.current} :** ${describeSetting(step, state.draft, context, t)}`,
    );
  }
  if (state.notice) embed.addFields({ name: '⚠️', value: state.notice });

  return {
    embeds: [embed],
    components: [...stepRows(step, state, context, t), navigationRow(state, context, t)],
  };
}

export function renderTimeZoneModal(locale: Locale): ModalBuilder {
  const t = messages(locale).configure;
  return new ModalBuilder()
    .setCustomId(encodeConfigure('tzmodal'))
    .setTitle(t.timeZoneModalTitle)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t.timeZoneModalLabel)
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('timeZone')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(64),
        ),
    );
}

export function describeSetting(
  step: SettingsStep,
  draft: GuildSettingsDraft,
  context: WizardViewContext,
  t: Messages,
): string {
  const fallback = defaultSettings(context.competitions.map((competition) => competition.id));
  switch (step) {
    case 'locale':
      return t.configure.localeNames[draft.locale ?? fallback.locale];
    case 'role':
      return draft.pingRoleId ? roleMention(draft.pingRoleId) : t.common.none;
    case 'channel':
      return draft.channelId ? channelMention(draft.channelId) : t.common.none;
    case 'competitions': {
      const ids = draft.competitionIds ?? fallback.competitionIds;
      const names = context.competitions.filter((c) => ids.includes(c.id)).map((c) => c.name);
      return names.length > 0 ? names.join(', ') : t.common.none;
    }
    case 'timeZone':
      return draft.timeZone ?? fallback.timeZone;
    case 'publish': {
      const { weekday, hour, minute } = draft.publish ?? fallback.publish;
      return `${t.weekday[weekday]} ${pad(hour)}:${pad(minute)}`;
    }
    case 'lock': {
      const { mode, offsetMinutes } = draft.lock ?? fallback.lock;
      return `${t.configure.lockMode[mode]} · ${t.configure.before(t.configure.offset(offsetMinutes))}`;
    }
    case 'recap':
      return t.configure.recap[draft.recapFrequency ?? fallback.recapFrequency];
    case 'reminders': {
      const { enabled, offsetMinutes } = draft.reminders ?? fallback.reminders;
      return enabled
        ? `${t.common.on} · ${t.configure.before(t.configure.offset(offsetMinutes))}`
        : t.common.off;
    }
  }
}

function stepRows(
  step: ReturnType<typeof currentStep>,
  state: WizardState,
  context: WizardViewContext,
  t: Messages,
): Row[] {
  const draft = state.draft;
  const fallback = defaultSettings(context.competitions.map((competition) => competition.id));
  switch (step) {
    case 'locale':
      return [
        buttonRow(
          (['fr', 'en'] as const).map((locale) =>
            toggle(
              encodeConfigure('locale', locale),
              t.configure.localeNames[locale],
              (draft.locale ?? fallback.locale) === locale,
            ),
          ),
        ),
      ];
    case 'role': {
      const menu = new RoleSelectMenuBuilder()
        .setCustomId(encodeConfigure('role'))
        .setPlaceholder(t.configure.placeholders.role);
      if (draft.pingRoleId) menu.setDefaultRoles(draft.pingRoleId);
      return [row(menu)];
    }
    case 'channel': {
      const menu = new ChannelSelectMenuBuilder()
        .setCustomId(encodeConfigure('channel'))
        .setPlaceholder(t.configure.placeholders.channel)
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
      if (draft.channelId) menu.setDefaultChannels(draft.channelId);
      return [row(menu)];
    }
    case 'competitions': {
      const selected = draft.competitionIds ?? fallback.competitionIds;
      return [
        row(
          new StringSelectMenuBuilder()
            .setCustomId(encodeConfigure('competitions'))
            .setPlaceholder(t.configure.placeholders.competitions)
            .setMinValues(1)
            .setMaxValues(context.competitions.length)
            .addOptions(
              context.competitions.map((c) => ({
                label: c.name,
                value: c.id,
                default: selected.includes(c.id),
              })),
            ),
        ),
      ];
    }
    case 'timeZone': {
      const current = draft.timeZone ?? fallback.timeZone;
      const zones: string[] = COMMON_TIME_ZONES.includes(current as (typeof COMMON_TIME_ZONES)[number])
        ? [...COMMON_TIME_ZONES]
        : [current, ...COMMON_TIME_ZONES.slice(0, 24)];
      return [
        row(
          new StringSelectMenuBuilder()
            .setCustomId(encodeConfigure('tz'))
            .setPlaceholder(t.configure.placeholders.timeZone)
            .addOptions(zones.map((zone) => ({ label: zone, value: zone, default: zone === current }))),
        ),
        buttonRow([
          new ButtonBuilder()
            .setCustomId(encodeConfigure('tzother'))
            .setLabel(t.configure.otherTimeZone)
            .setStyle(ButtonStyle.Secondary),
        ]),
      ];
    }
    case 'publish': {
      const publish = draft.publish ?? fallback.publish;
      return [
        row(
          new StringSelectMenuBuilder()
            .setCustomId(encodeConfigure('weekday'))
            .setPlaceholder(t.configure.placeholders.weekday)
            .addOptions(
              ([1, 2, 3, 4, 5, 6, 7] as const).map((day: Weekday) => ({
                label: t.weekday[day],
                value: String(day),
                default: day === publish.weekday,
              })),
            ),
        ),
        row(
          new StringSelectMenuBuilder()
            .setCustomId(encodeConfigure('hour'))
            .setPlaceholder(t.configure.placeholders.hour)
            .addOptions(
              Array.from({ length: 24 }, (_, hour) => ({
                label: `${pad(hour)}:00`,
                value: String(hour),
                default: hour === publish.hour,
              })),
            ),
        ),
      ];
    }
    case 'lock': {
      const lock = draft.lock ?? fallback.lock;
      return [
        buttonRow(
          (['per-day', 'per-match'] as const).map((mode) =>
            toggle(encodeConfigure('lockmode', mode), t.configure.lockMode[mode], lock.mode === mode),
          ),
        ),
        offsetSelect(encodeConfigure('lockoffset'), LOCK_OFFSETS, lock.offsetMinutes, t),
      ];
    }
    case 'recap': {
      const frequency = draft.recapFrequency ?? fallback.recapFrequency;
      return [
        buttonRow(
          (['daily', 'weekly'] as const).map((value) =>
            toggle(encodeConfigure('recap', value), t.configure.recap[value], frequency === value),
          ),
        ),
      ];
    }
    case 'reminders': {
      const reminders = draft.reminders ?? fallback.reminders;
      const select = offsetSelect(
        encodeConfigure('reminderoffset'),
        REMINDER_OFFSETS,
        reminders.offsetMinutes,
        t,
      );
      select.components[0]?.setDisabled(!reminders.enabled);
      return [
        buttonRow([
          toggle(encodeConfigure('reminders', 'on'), t.common.on, reminders.enabled),
          toggle(encodeConfigure('reminders', 'off'), t.common.off, !reminders.enabled),
        ]),
        select,
      ];
    }
    case 'summary':
      return [];
  }
}

function navigationRow(state: WizardState, context: WizardViewContext, t: Messages): Row {
  const step = currentStep(state);
  const previous = new ButtonBuilder()
    .setCustomId(encodeConfigure('nav', 'prev'))
    .setLabel(t.configure.previous)
    .setEmoji('◀️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(state.stepIndex === 0);
  const cancel = new ButtonBuilder()
    .setCustomId(encodeConfigure('nav', 'cancel'))
    .setLabel(t.configure.cancel)
    .setStyle(ButtonStyle.Danger);

  if (step === 'summary') {
    const confirm = new ButtonBuilder()
      .setCustomId(encodeConfigure('nav', 'confirm'))
      .setLabel(t.configure.confirm)
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success);
    return buttonRow([previous, confirm, cancel]);
  }

  const keepDefault = new ButtonBuilder()
    .setCustomId(encodeConfigure('nav', 'default'))
    .setLabel(t.configure.keepDefault)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(defaultPatchFor(step, context.competitions, state.invokedFromChannelId) === null);
  const next = new ButtonBuilder()
    .setCustomId(encodeConfigure('nav', 'next'))
    .setLabel(t.configure.next)
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!canAdvance(state));
  return buttonRow([previous, keepDefault, next, cancel]);
}

function offsetSelect(customId: string, offsets: readonly number[], current: number, t: Messages): Row {
  const values = offsets.includes(current) ? offsets : [...offsets, current].toSorted((a, b) => a - b);
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(t.configure.placeholders.offset)
      .addOptions(
        values.map((minutes) => ({
          label: t.configure.before(t.configure.offset(minutes)),
          value: String(minutes),
          default: minutes === current,
        })),
      ),
  );
}

function toggle(customId: string, label: string, selected: boolean): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function row(component: MessageActionRowComponentBuilder): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(component);
}

function buttonRow(buttons: ButtonBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
