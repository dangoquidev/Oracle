import { describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../../config/competitions.js';
import { activeGuild, settings } from '../../../test-support/builders.js';
import { patchFor, type ConfigOptions } from '../commands/config-command.js';
import { messages } from '../i18n/index.js';
import {
  currentSettingMessage,
  renderSettings,
  settingsFailureMessage,
  settingUpdatedMessage,
} from './settings.js';

const options = (values: Record<string, string | number | boolean>): ConfigOptions => ({
  string: (name) => (typeof values[name] === 'string' ? values[name] : null),
  integer: (name) => (typeof values[name] === 'number' ? values[name] : null),
  boolean: (name) => (typeof values[name] === 'boolean' ? values[name] : null),
  id: (name) => (typeof values[name] === 'string' ? values[name] : null),
});

const configured = {
  ...activeGuild('g1', { competitionIds: ['lec'] }),
  settings: settings({ competitionIds: ['lec'] }),
};

describe('patchFor', () => {
  it('maps each subcommand to the setting it changes', () => {
    expect(patchFor('channel', options({ channel: 'c2' }))).toEqual({ channelId: 'c2' });
    expect(patchFor('role', options({ role: 'r2' }))).toEqual({ pingRoleId: 'r2' });
    expect(patchFor('timezone', options({ timezone: ' Asia/Seoul ' }))).toEqual({ timeZone: 'Asia/Seoul' });
    expect(patchFor('language', options({ language: 'en' }))).toEqual({ locale: 'en' });
    expect(patchFor('recap', options({ frequency: 'daily' }))).toEqual({ recapFrequency: 'daily' });
    expect(patchFor('competitions', options({ competition: 'worlds', enabled: true }))).toEqual({
      competition: { id: 'worlds', enabled: true },
    });
  });

  it('only changes the given parts of nested settings', () => {
    expect(patchFor('lock', options({ delay: 60 }))).toEqual({ lock: { offsetMinutes: 60 } });
    expect(patchFor('reminders', options({ enabled: false }))).toEqual({ reminders: { enabled: false } });
    expect(patchFor('publish', options({ day: 5, hour: 18 }))).toEqual({ publish: { weekday: 5, hour: 18 } });
    expect(patchFor('lock', options({}))).toEqual({ lock: {} });
  });

  it('ignores values outside the offered choices', () => {
    expect(patchFor('language', options({ language: 'de' }))).toEqual({});
    expect(patchFor('lock', options({ mode: 'per-week' }))).toEqual({ lock: {} });
    expect(patchFor('publish', options({ day: 9 }))).toEqual({ publish: {} });
    expect(patchFor('competitions', options({ competition: 'lec' }))).toEqual({});
  });
});

describe('settings views', () => {
  const t = messages('fr');

  it('lists every setting and the bot status', () => {
    const embed = renderSettings(configured, COMPETITIONS, t).embeds[0]?.toJSON();
    expect(embed?.title).toBe('⚙️ Configuration d’Oracle');
    expect(embed?.fields?.map((field) => [field.name, field.value])).toEqual([
      ['État', '🟢 Actif'],
      ['Langue', 'Français'],
      ['Rôle', '<@&role-1>'],
      ['Salon', '<#channel-1>'],
      ['Compétitions', 'LEC'],
      ['Fuseau horaire', 'Europe/Paris'],
      ['Publication', 'Mardi 10:00'],
      ['Fermeture des votes', 'Par journée · 2 h avant'],
      ['Récap', 'Fin de semaine'],
      ['Rappels', 'Activé · 1 h avant'],
    ]);
  });

  it('explains why the bot is paused and how to fix it', () => {
    const paused = { ...configured, status: 'paused' as const, pauseReason: 'channel-deleted' as const };
    const status = renderSettings(paused, COMPETITIONS, messages('en')).embeds[0]?.toJSON().fields?.[0]
      ?.value;
    expect(status).toBe(
      '⏸️ Paused: The announcement channel was deleted.\nPick a new channel or role with `/config channel` or `/config role` to reactivate the bot.',
    );
  });

  it('confirms a change with its new value, reactivation and warnings', () => {
    const message = settingUpdatedMessage(
      'lock',
      {
        settings: settings({ lock: { mode: 'per-match', offsetMinutes: 30 } }),
        warnings: ['cannot-use-external-emojis'],
        reactivated: true,
      },
      COMPETITIONS,
      t,
    );
    expect(message.split('\n\n')).toEqual([
      '✅ Réglage mis à jour · **Fermeture des votes** : Par match · 30 min avant',
      '▶️ Le bot est de nouveau actif sur ce serveur.',
      t.configure.warnings['cannot-use-external-emojis'],
    ]);
  });

  it('shows the current value when nothing was given', () => {
    expect(currentSettingMessage('reminders', configured, COMPETITIONS, t)).toBe(
      '**Rappels** · Valeur actuelle : Activé · 1 h avant\n-# Précise au moins une option pour modifier ce réglage.',
    );
  });

  it('lists what prevents saving', () => {
    expect(settingsFailureMessage({ kind: 'invalid-settings', errors: ['no-competition'] }, t)).toBe(
      'La configuration est incomplète :\n• aucune compétition choisie',
    );
    expect(settingsFailureMessage({ kind: 'missing-permissions', issues: ['channel-not-found'] }, t)).toBe(
      'Je ne pourrai pas publier correctement. À corriger :\n• Le salon choisi est introuvable.',
    );
  });
});
