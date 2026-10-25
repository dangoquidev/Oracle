import { describe, expect, it } from 'vitest';
import { defaultSettings, type GuildSettings } from './guild-settings.js';
import { accessOf, pauseReasonForDeletion, type Guild } from './guild.js';

const settings: GuildSettings = { ...defaultSettings(['lec']), pingRoleId: 'role', channelId: 'chan' };
const guild = (status: Guild['status'], withSettings = true): Guild => ({
  id: 'g',
  status,
  pauseReason: null,
  settings: withSettings ? settings : null,
});

describe('accessOf', () => {
  it('allows configured active guilds only', () => {
    expect(accessOf(guild('active'))).toBe('allowed');
    expect(accessOf(guild('active', false))).toBe('unconfigured');
    expect(accessOf(guild('paused'))).toBe('paused');
    expect(accessOf(guild('unconfigured', false))).toBe('unconfigured');
    expect(accessOf(guild('left'))).toBe('unconfigured');
    expect(accessOf(null)).toBe('unconfigured');
  });
});

describe('pauseReasonForDeletion', () => {
  it('detects deletion of the configured role or channel', () => {
    expect(pauseReasonForDeletion(settings, { roleId: 'role' })).toBe('role-deleted');
    expect(pauseReasonForDeletion(settings, { channelId: 'chan' })).toBe('channel-deleted');
  });

  it('ignores unrelated deletions', () => {
    expect(pauseReasonForDeletion(settings, { roleId: 'other' })).toBeNull();
    expect(pauseReasonForDeletion(settings, { channelId: 'other' })).toBeNull();
    expect(pauseReasonForDeletion(settings, {})).toBeNull();
  });
});
