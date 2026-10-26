import { describe, expect, it } from 'vitest';
import { defaultSettings, type GuildSettings } from './guild-settings.js';
import { applySettingsPatch, isEmptyPatch } from './settings-patch.js';

const current: GuildSettings = { ...defaultSettings(['lec']), pingRoleId: 'r1', channelId: 'c1' };

describe('applySettingsPatch', () => {
  it('replaces plain values and keeps the others', () => {
    expect(applySettingsPatch(current, { channelId: 'c2', locale: 'en' })).toEqual({
      ...current,
      channelId: 'c2',
      locale: 'en',
    });
  });

  it('changes nested values field by field', () => {
    const patched = applySettingsPatch(current, {
      lock: { mode: 'per-match' },
      publish: { hour: 18 },
      reminders: { enabled: false },
    });
    expect(patched.lock).toEqual({ mode: 'per-match', offsetMinutes: 120 });
    expect(patched.publish).toEqual({ weekday: 2, hour: 18, minute: 0 });
    expect(patched.reminders).toEqual({ enabled: false, offsetMinutes: 60 });
  });

  it('enables or disables one competition', () => {
    expect(
      applySettingsPatch(current, { competition: { id: 'worlds', enabled: true } }).competitionIds,
    ).toEqual(['lec', 'worlds']);
    expect(applySettingsPatch(current, { competition: { id: 'lec', enabled: true } }).competitionIds).toEqual(
      ['lec'],
    );
    expect(
      applySettingsPatch(current, { competition: { id: 'lec', enabled: false } }).competitionIds,
    ).toEqual([]);
  });
});

describe('isEmptyPatch', () => {
  it('tells whether anything would change', () => {
    expect(isEmptyPatch({})).toBe(true);
    expect(isEmptyPatch({ lock: {}, publish: {} })).toBe(true);
    expect(isEmptyPatch({ lock: { offsetMinutes: 60 } })).toBe(false);
    expect(isEmptyPatch({ locale: 'en' })).toBe(false);
  });
});
