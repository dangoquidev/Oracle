import type { Competition } from '../../../domain/competition/competition.js';
import { defaultSettings, type GuildSettingsDraft } from '../../../domain/guild/guild-settings.js';
import type { ChannelId } from '../../../domain/shared/ids.js';

export const WIZARD_STEPS = [
  'locale',
  'role',
  'channel',
  'competitions',
  'timeZone',
  'publish',
  'lock',
  'recap',
  'reminders',
  'summary',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];
export type SettingsStep = Exclude<WizardStep, 'summary'>;

export interface WizardState {
  readonly stepIndex: number;
  readonly draft: GuildSettingsDraft;
  /** Channel /configure was run from: the natural default announcement channel. */
  readonly invokedFromChannelId: ChannelId | null;
  /** One-off feedback shown on the next render (e.g. invalid time zone). */
  readonly notice: string | null;
}

export function startWizard(draft: GuildSettingsDraft, invokedFromChannelId: ChannelId | null): WizardState {
  return { stepIndex: 0, draft, invokedFromChannelId, notice: null };
}

export function currentStep(state: WizardState): WizardStep {
  return WIZARD_STEPS[state.stepIndex] ?? 'summary';
}

export function totalSettingsSteps(): number {
  return WIZARD_STEPS.length - 1;
}

/** A step can be left forward once its value is set (role and channel have no default). */
export function canAdvance(state: WizardState): boolean {
  const step = currentStep(state);
  if (step === 'role') return Boolean(state.draft.pingRoleId);
  if (step === 'channel') return Boolean(state.draft.channelId);
  if (step === 'competitions') return (state.draft.competitionIds?.length ?? 0) > 0;
  return step !== 'summary';
}

export function next(state: WizardState): WizardState {
  if (!canAdvance(state)) return state;
  return { ...state, stepIndex: Math.min(state.stepIndex + 1, WIZARD_STEPS.length - 1), notice: null };
}

export function previous(state: WizardState): WizardState {
  return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0), notice: null };
}

export function update(state: WizardState, patch: GuildSettingsDraft): WizardState {
  return { ...state, draft: { ...state.draft, ...patch }, notice: null };
}

export function withNotice(state: WizardState, notice: string): WizardState {
  return { ...state, notice };
}

/** Default value of a step, or null when the step has none (the role must be picked). */
export function defaultPatchFor(
  step: WizardStep,
  competitions: readonly Competition[],
  invokedFromChannelId: ChannelId | null,
): GuildSettingsDraft | null {
  const defaults = defaultSettings(competitions.map((competition) => competition.id));
  switch (step) {
    case 'locale':
      return { locale: defaults.locale };
    case 'role':
    case 'summary':
      return null;
    case 'channel':
      return invokedFromChannelId ? { channelId: invokedFromChannelId } : null;
    case 'competitions':
      return { competitionIds: defaults.competitionIds };
    case 'timeZone':
      return { timeZone: defaults.timeZone };
    case 'publish':
      return { publish: defaults.publish };
    case 'lock':
      return { lock: defaults.lock };
    case 'recap':
      return { recapFrequency: defaults.recapFrequency };
    case 'reminders':
      return { reminders: defaults.reminders };
  }
}

/** Applies the step default and moves on. */
export function keepDefault(state: WizardState, competitions: readonly Competition[]): WizardState {
  const patch = defaultPatchFor(currentStep(state), competitions, state.invokedFromChannelId);
  return patch ? next(update(state, patch)) : state;
}
