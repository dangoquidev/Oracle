import { beforeEach, describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../config/competitions.js';
import { activeGuild } from '../../test-support/builders.js';
import {
  FixedClock,
  InMemoryBanRepository,
  InMemoryGuildRepository,
  SilentLogger,
  StubPermissionChecker,
  StubSyncTrigger,
} from '../../test-support/fakes.js';
import { ManagePlayerBans } from './player-bans.js';
import { RequestScheduleSync } from './request-schedule-sync.js';
import { GetGuildSettings, UpdateGuildSettings } from './update-guild-settings.js';

describe('UpdateGuildSettings', () => {
  let guilds: InMemoryGuildRepository;
  let permissions: StubPermissionChecker;
  const update = (patch: Parameters<UpdateGuildSettings['execute']>[1], guildId = 'g1') =>
    new UpdateGuildSettings(guilds, permissions, COMPETITIONS).execute(guildId, patch);

  beforeEach(() => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1', { competitionIds: ['lec'] }));
    permissions = new StubPermissionChecker();
  });

  it('changes one setting and keeps the others', async () => {
    const result = await update({ lock: { offsetMinutes: 60 } });
    expect(result.ok && result.value).toMatchObject({
      settings: { lock: { mode: 'per-day', offsetMinutes: 60 }, competitionIds: ['lec'] },
      warnings: [],
      reactivated: false,
    });
    expect(guilds.guilds.get('g1')?.settings?.lock.offsetMinutes).toBe(60);
  });

  it('checks the bot can still publish with the new channel or role', async () => {
    permissions.result = { issues: ['cannot-send-messages'], warnings: [] };
    expect(await update({ channelId: 'other' })).toEqual({
      ok: false,
      error: { kind: 'missing-permissions', issues: ['cannot-send-messages'] },
    });
    expect(permissions.calls).toEqual([{ guildId: 'g1', channelId: 'other', roleId: 'role-1' }]);
    expect(guilds.guilds.get('g1')?.settings?.channelId).toBe('channel-1');
  });

  it('refuses invalid settings, such as disabling the last competition', async () => {
    expect(await update({ competition: { id: 'lec', enabled: false } })).toEqual({
      ok: false,
      error: { kind: 'invalid-settings', errors: ['no-competition'] },
    });
    expect(await update({ timeZone: 'Mars/Olympus' })).toMatchObject({
      error: { errors: ['invalid-time-zone'] },
    });
  });

  it('reactivates a paused server once the deleted channel is replaced', async () => {
    guilds.add({ ...activeGuild('g1'), status: 'paused', pauseReason: 'channel-deleted' });
    const result = await update({ channelId: 'new-channel' });
    expect(result.ok && result.value.reactivated).toBe(true);
    expect(guilds.guilds.get('g1')).toMatchObject({ status: 'active', pauseReason: null });
  });

  it('needs a server configured with /configure first', async () => {
    guilds.add({ id: 'g2', status: 'unconfigured', pauseReason: null, settings: null });
    expect(await update({ locale: 'en' }, 'g2')).toEqual({ ok: false, error: { kind: 'not-configured' } });
    guilds.add({ ...activeGuild('g3'), status: 'left' });
    expect(await update({ locale: 'en' }, 'g3')).toEqual({ ok: false, error: { kind: 'not-configured' } });
  });
});

describe('GetGuildSettings', () => {
  it('returns configured servers only', async () => {
    const guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
    const settings = new GetGuildSettings(guilds);
    expect(await settings.execute('g1')).toMatchObject({ status: 'active', settings: { locale: 'fr' } });
    expect(await settings.execute('nope')).toBeNull();
  });
});

describe('ManagePlayerBans', () => {
  let guilds: InMemoryGuildRepository;
  let bans: InMemoryBanRepository;
  let manage: ManagePlayerBans;

  beforeEach(() => {
    guilds = new InMemoryGuildRepository().add(activeGuild('g1'));
    bans = new InMemoryBanRepository();
    manage = new ManagePlayerBans(guilds, bans, new FixedClock(new Date('2026-08-01T10:00:00Z')));
  });

  it('bans a player once, with a trimmed reason', async () => {
    const command = { guildId: 'g1', adminId: 'admin', userId: 'u1', reason: '  triche  ' };
    expect(await manage.ban(command)).toEqual({ ok: true, value: 'banned' });
    expect(await manage.ban(command)).toEqual({ ok: true, value: 'already-banned' });
    expect(bans.bans.get('g1:u1')).toEqual({
      guildId: 'g1',
      userId: 'u1',
      bannedBy: 'admin',
      reason: 'triche',
      bannedAt: new Date('2026-08-01T10:00:00Z'),
    });
  });

  it('stores no reason when it is blank', async () => {
    await manage.ban({ guildId: 'g1', adminId: 'admin', userId: 'u1', reason: '   ' });
    expect(bans.bans.get('g1:u1')?.reason).toBeNull();
  });

  it('refuses to ban yourself or on an inactive server', async () => {
    expect(await manage.ban({ guildId: 'g1', adminId: 'u1', userId: 'u1', reason: null })).toEqual({
      ok: false,
      error: 'cannot-ban-self',
    });
    expect(await manage.ban({ guildId: 'nope', adminId: 'a', userId: 'u1', reason: null })).toEqual({
      ok: false,
      error: 'guild-not-active',
    });
    expect(await manage.unban('nope', 'u1')).toEqual({ ok: false, error: 'guild-not-active' });
  });

  it('lifts a ban', async () => {
    await manage.ban({ guildId: 'g1', adminId: 'admin', userId: 'u1', reason: null });
    expect(await manage.unban('g1', 'u1')).toEqual({ ok: true, value: 'unbanned' });
    expect(await manage.unban('g1', 'u1')).toEqual({ ok: true, value: 'not-banned' });
  });
});

describe('RequestScheduleSync', () => {
  it('queues a sync from any server unless one was requested too recently', async () => {
    const trigger = new StubSyncTrigger();
    const sync = new RequestScheduleSync(trigger, new SilentLogger());
    expect(await sync.execute('unconfigured', 'admin')).toEqual({ ok: true, value: undefined });
    trigger.accept = false;
    expect(await sync.execute('g1', 'admin')).toEqual({ ok: false, error: 'throttled' });
    expect(trigger.requests).toBe(2);
  });
});
