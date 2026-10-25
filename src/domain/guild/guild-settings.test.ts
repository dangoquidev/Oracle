import { describe, expect, it } from 'vitest';
import { defaultSettings, validateSettings } from './guild-settings.js';

const known = new Set(['lec', 'worlds']);

describe('validateSettings', () => {
  it('fills defaults around role and channel', () => {
    const result = validateSettings({ pingRoleId: 'r1', channelId: 'c1' }, known);
    expect(result).toEqual({
      ok: true,
      value: { ...defaultSettings(['lec', 'worlds']), pingRoleId: 'r1', channelId: 'c1' },
    });
  });

  it('defaults to French, Paris, Tuesday 10:00, per-day lock 2h, weekly recap', () => {
    const defaults = defaultSettings(['lec']);
    expect(defaults.locale).toBe('fr');
    expect(defaults.timeZone).toBe('Europe/Paris');
    expect(defaults.publish).toEqual({ weekday: 2, hour: 10, minute: 0 });
    expect(defaults.lock).toEqual({ mode: 'per-day', offsetMinutes: 120 });
    expect(defaults.recapFrequency).toBe('weekly');
  });

  it('requires a role and a channel', () => {
    expect(validateSettings({}, known)).toEqual({ ok: false, error: ['missing-role', 'missing-channel'] });
  });

  it('reports every invalid field', () => {
    const result = validateSettings(
      {
        pingRoleId: 'r1',
        channelId: 'c1',
        competitionIds: ['lck'],
        timeZone: 'Mars/Olympus',
        publish: { weekday: 2, hour: 24, minute: 0 },
        lock: { mode: 'per-day', offsetMinutes: -5 },
        reminders: { enabled: true, offsetMinutes: 1.5 },
      },
      known,
    );
    expect(result).toEqual({
      ok: false,
      error: [
        'unknown-competition',
        'invalid-time-zone',
        'invalid-publish-time',
        'invalid-lock-offset',
        'invalid-reminder-offset',
      ],
    });
  });

  it('requires at least one competition', () => {
    const result = validateSettings({ pingRoleId: 'r1', channelId: 'c1', competitionIds: [] }, known);
    expect(result).toEqual({ ok: false, error: ['no-competition'] });
  });
});
