import { describe, expect, it } from 'vitest';
import type { Competition } from '../../../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../../../domain/competition/scoring.js';
import { decodeConfigure } from '../components/custom-id.js';
import { messages } from '../i18n/index.js';
import { startWizard, WIZARD_STEPS, type WizardState } from './configure-wizard.js';
import { describeSetting, renderTimeZoneModal, renderWizard } from './configure-wizard-view.js';

const competitions: Competition[] = [
  { id: 'worlds', name: 'Worlds', source: { league: 'W' }, scoring: DEFAULT_SCORING },
  { id: 'lec', name: 'LEC', source: { league: 'L' }, scoring: DEFAULT_SCORING },
];
const context = { competitions };
const at = (step: (typeof WIZARD_STEPS)[number], draft: WizardState['draft'] = {}): WizardState => ({
  ...startWizard(draft, null),
  stepIndex: WIZARD_STEPS.indexOf(step),
});

const componentsOf = (state: WizardState) =>
  renderWizard(state, context).components.map((row) => row.toJSON().components);

const navOf = (state: WizardState) =>
  (componentsOf(state).at(-1) ?? []).map((c) => c as { custom_id: string; disabled?: boolean });

describe('configure wizard view', () => {
  it('renders every step without breaking Discord limits', () => {
    for (const step of WIZARD_STEPS) {
      const view = renderWizard(at(step, { pingRoleId: 'r', channelId: 'c' }), context);
      expect(view.components.length).toBeLessThanOrEqual(5);
      for (const row of view.components) expect(row.toJSON().components.length).toBeLessThanOrEqual(5);
    }
  });

  it('titles steps with their position', () => {
    const embed = renderWizard(at('role'), context).embeds[0]?.toJSON();
    expect(embed?.title).toBe('Configuration · 2/9 · Rôle à mentionner');
  });

  it('disables "next" and "keep default" on the role step until a role is chosen', () => {
    const [previous, keepDefault, next, cancel] = navOf(at('role'));
    expect(previous?.disabled).toBe(false);
    expect(keepDefault?.disabled).toBe(true);
    expect(next?.disabled).toBe(true);
    expect(decodeConfigure(cancel?.custom_id ?? '')).toEqual({ action: 'nav', arg: 'cancel' });
    expect(navOf(at('role', { pingRoleId: 'r' }))[2]?.disabled).toBe(false);
  });

  it('confirms from the summary, listing every setting', () => {
    const state = at('summary', { pingRoleId: 'r', channelId: 'c', locale: 'en' });
    const embed = renderWizard(state, context).embeds[0]?.toJSON();
    expect(embed?.fields?.map((f) => f.name)).toEqual([
      'Language',
      'Role',
      'Channel',
      'Competitions',
      'Time zone',
      'Announcement',
      'Voting close',
      'Recap',
      'Reminders',
    ]);
    expect(navOf(state).map((c) => decodeConfigure(c.custom_id)?.arg)).toEqual(['prev', 'confirm', 'cancel']);
  });

  it('shows notices', () => {
    const embed = renderWizard({ ...at('timeZone'), notice: 'bad zone' }, context).embeds[0]?.toJSON();
    expect(embed?.fields?.[0]?.value).toBe('bad zone');
  });

  it('keeps a custom time zone selectable', () => {
    const [select] = componentsOf(at('timeZone', { timeZone: 'America/Montevideo' }))[0] ?? [];
    const options = (select as { options: { value: string; default?: boolean }[] }).options;
    expect(options).toHaveLength(25);
    expect(options[0]).toMatchObject({ value: 'America/Montevideo', default: true });
  });

  it('disables the reminder delay when reminders are off', () => {
    const rows = componentsOf(at('reminders', { reminders: { enabled: false, offsetMinutes: 60 } }));
    expect((rows[1]?.[0] as { disabled?: boolean }).disabled).toBe(true);
  });

  it('lists an unusual lock offset among the options', () => {
    const rows = componentsOf(at('lock', { lock: { mode: 'per-match', offsetMinutes: 45 } }));
    const options = (rows[1]?.[0] as { options: { value: string; default?: boolean }[] }).options;
    expect(options.find((o) => o.default)?.value).toBe('45');
  });

  it('describes settings in plain words', () => {
    const t = messages('fr');
    const draft = {
      pingRoleId: '1',
      channelId: '2',
      competitionIds: ['lec'],
      publish: { weekday: 2, hour: 9, minute: 5 },
      lock: { mode: 'per-day', offsetMinutes: 120 },
      reminders: { enabled: false, offsetMinutes: 60 },
    } as const;
    expect(describeSetting('role', draft, context, t)).toBe('<@&1>');
    expect(describeSetting('channel', draft, context, t)).toBe('<#2>');
    expect(describeSetting('competitions', draft, context, t)).toBe('LEC');
    expect(describeSetting('competitions', { competitionIds: [] }, context, t)).toBe('Aucun');
    expect(describeSetting('publish', draft, context, t)).toBe('Mardi 09:05');
    expect(describeSetting('lock', draft, context, t)).toBe('Par journée · 2 h avant');
    expect(describeSetting('reminders', draft, context, t)).toBe('Désactivé');
    expect(describeSetting('reminders', {}, context, t)).toBe('Activé · 1 h avant');
    expect(describeSetting('role', {}, context, t)).toBe('Aucun');
    expect(describeSetting('channel', {}, context, t)).toBe('Aucun');
    expect(describeSetting('recap', {}, context, t)).toBe('Fin de semaine');
    expect(describeSetting('locale', {}, context, t)).toBe('Français');
    expect(describeSetting('timeZone', {}, context, t)).toBe('Europe/Paris');
  });

  it('builds the custom time zone modal', () => {
    expect(renderTimeZoneModal('en').toJSON().title).toBe('Time zone');
  });
});
