import { describe, expect, it } from 'vitest';
import type { Competition } from '../../../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../../../domain/competition/scoring.js';
import {
  canAdvance,
  currentStep,
  defaultPatchFor,
  keepDefault,
  next,
  previous,
  startWizard,
  totalSettingsSteps,
  update,
  withNotice,
  WIZARD_STEPS,
} from './configure-wizard.js';

const competitions: Competition[] = [
  { id: 'lec', name: 'LEC', source: { league: 'L' }, scoring: DEFAULT_SCORING },
  { id: 'worlds', name: 'Worlds', source: { league: 'W' }, scoring: DEFAULT_SCORING },
];

const at = (step: (typeof WIZARD_STEPS)[number], draft = {}) => ({
  ...startWizard(draft, 'chan-here'),
  stepIndex: WIZARD_STEPS.indexOf(step),
});

describe('configure wizard', () => {
  it('walks through nine settings steps and a summary', () => {
    expect(totalSettingsSteps()).toBe(9);
    let state = startWizard({ pingRoleId: 'r', channelId: 'c', competitionIds: ['lec'] }, null);
    const visited = [currentStep(state)];
    while (currentStep(state) !== 'summary') {
      state = next(state);
      visited.push(currentStep(state));
    }
    expect(visited).toEqual([...WIZARD_STEPS]);
    expect(currentStep(next(state))).toBe('summary');
  });

  it('blocks role, channel and competitions until a value is set', () => {
    expect(canAdvance(at('role'))).toBe(false);
    expect(canAdvance(at('role', { pingRoleId: 'r' }))).toBe(true);
    expect(canAdvance(at('channel'))).toBe(false);
    expect(canAdvance(at('competitions', { competitionIds: [] }))).toBe(false);
    expect(next(at('role'))).toEqual(at('role'));
    expect(canAdvance(at('summary'))).toBe(false);
  });

  it('goes back but not before the first step', () => {
    expect(currentStep(previous(at('channel')))).toBe('role');
    expect(currentStep(previous(startWizard({}, null)))).toBe('locale');
  });

  it('updates the draft and clears notices', () => {
    const state = update(withNotice(at('locale'), 'oops'), { locale: 'en' });
    expect(state.draft.locale).toBe('en');
    expect(state.notice).toBeNull();
  });

  it('keeps defaults and moves on', () => {
    const state = keepDefault(at('lock', { lock: { mode: 'per-match', offsetMinutes: 5 } }), competitions);
    expect(state.draft.lock).toEqual({ mode: 'per-day', offsetMinutes: 120 });
    expect(currentStep(state)).toBe('recap');
  });

  it('defaults the channel to where /configure was run, and has no default role', () => {
    expect(defaultPatchFor('channel', competitions, 'here')).toEqual({ channelId: 'here' });
    expect(defaultPatchFor('channel', competitions, null)).toBeNull();
    expect(defaultPatchFor('role', competitions, 'here')).toBeNull();
    expect(keepDefault(at('role'), competitions)).toEqual(at('role'));
  });

  it('provides a default for every other step', () => {
    expect(defaultPatchFor('locale', competitions, null)).toEqual({ locale: 'fr' });
    expect(defaultPatchFor('competitions', competitions, null)).toEqual({
      competitionIds: ['lec', 'worlds'],
    });
    expect(defaultPatchFor('timeZone', competitions, null)).toEqual({ timeZone: 'Europe/Paris' });
    expect(defaultPatchFor('publish', competitions, null)).toEqual({
      publish: { weekday: 2, hour: 10, minute: 0 },
    });
    expect(defaultPatchFor('recap', competitions, null)).toEqual({ recapFrequency: 'weekly' });
    expect(defaultPatchFor('reminders', competitions, null)).toEqual({
      reminders: { enabled: true, offsetMinutes: 60 },
    });
    expect(defaultPatchFor('summary', competitions, null)).toBeNull();
  });
});
