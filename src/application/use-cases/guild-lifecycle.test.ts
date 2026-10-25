import { beforeEach, describe, expect, it } from 'vitest';
import { activeGuild } from '../../test-support/builders.js';
import {
  InMemoryGuildRepository,
  RecordingMessenger,
  SilentLogger,
  StubPermissionChecker,
} from '../../test-support/fakes.js';
import { CheckGuildAccess } from './check-guild-access.js';
import { HandleResourceDeleted } from './handle-resource-deleted.js';
import { LeaveGuild } from './leave-guild.js';
import { ReconcileGuilds } from './reconcile-guilds.js';
import { RegisterGuild } from './register-guild.js';

describe('guild lifecycle', () => {
  let guilds: InMemoryGuildRepository;
  let messenger: RecordingMessenger;
  let permissions: StubPermissionChecker;
  let logger: SilentLogger;
  let register: RegisterGuild;
  let leave: LeaveGuild;
  let handleDeleted: HandleResourceDeleted;

  beforeEach(() => {
    guilds = new InMemoryGuildRepository();
    messenger = new RecordingMessenger();
    permissions = new StubPermissionChecker();
    logger = new SilentLogger();
    register = new RegisterGuild(guilds, messenger, logger);
    leave = new LeaveGuild(guilds);
    handleDeleted = new HandleResourceDeleted(guilds, messenger, logger);
  });

  describe('RegisterGuild', () => {
    it('registers a new server as unconfigured and greets it', async () => {
      await register.execute('g1');
      expect(guilds.guilds.get('g1')?.status).toBe('unconfigured');
      expect(messenger.welcomes).toEqual(['g1']);
    });

    it('does not greet a server twice', async () => {
      await register.execute('g1');
      await register.execute('g1');
      expect(messenger.welcomes).toEqual(['g1']);
    });

    it('greets again a server that removed then re-added the bot, which must be reconfigured', async () => {
      guilds.add({ ...activeGuild('g1'), status: 'left' });
      await register.execute('g1');
      expect(guilds.guilds.get('g1')?.status).toBe('unconfigured');
      expect(messenger.welcomes).toEqual(['g1']);
    });

    it('survives a welcome that cannot be delivered', async () => {
      messenger.failWith = new Error('no channel');
      await expect(register.execute('g1')).resolves.toBeUndefined();
      expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
    });
  });

  describe('LeaveGuild', () => {
    it('marks the server as left', async () => {
      guilds.add(activeGuild('g1'));
      await leave.execute('g1');
      expect(guilds.guilds.get('g1')?.status).toBe('left');
    });
  });

  describe('HandleResourceDeleted', () => {
    it('pauses and notifies when the configured role is deleted', async () => {
      guilds.add(activeGuild('g1', { pingRoleId: 'role', locale: 'en' }));
      await handleDeleted.execute('g1', { roleId: 'role' });
      expect(guilds.guilds.get('g1')).toMatchObject({ status: 'paused', pauseReason: 'role-deleted' });
      expect(messenger.pauses).toEqual([{ guildId: 'g1', reason: 'role-deleted', locale: 'en' }]);
    });

    it('pauses when the configured channel is deleted', async () => {
      guilds.add(activeGuild('g1', { channelId: 'chan' }));
      await handleDeleted.execute('g1', { channelId: 'chan' });
      expect(guilds.guilds.get('g1')?.pauseReason).toBe('channel-deleted');
    });

    it('ignores unrelated deletions and inactive servers', async () => {
      guilds.add(activeGuild('g1'));
      guilds.add({ id: 'g2', status: 'unconfigured', pauseReason: null, settings: null });
      await handleDeleted.execute('g1', { roleId: 'other' });
      await handleDeleted.execute('g2', { roleId: 'role-1' });
      await handleDeleted.execute('unknown', { roleId: 'role-1' });
      expect(guilds.guilds.get('g1')?.status).toBe('active');
      expect(messenger.pauses).toEqual([]);
    });

    it('stays paused even if the notice cannot be delivered', async () => {
      guilds.add(activeGuild('g1'));
      messenger.failWith = new Error('no channel');
      await handleDeleted.execute('g1', { roleId: 'role-1' });
      expect(guilds.guilds.get('g1')?.status).toBe('paused');
    });
  });

  describe('ReconcileGuilds', () => {
    const reconcile = () => new ReconcileGuilds(guilds, permissions, register, leave, handleDeleted);

    it('registers servers joined and marks servers left while offline', async () => {
      guilds.add(activeGuild('stays'));
      guilds.add(activeGuild('gone'));
      await reconcile().execute(['stays', 'new']);
      expect(guilds.guilds.get('new')?.status).toBe('unconfigured');
      expect(guilds.guilds.get('gone')?.status).toBe('left');
      expect(guilds.guilds.get('stays')?.status).toBe('active');
      expect(messenger.welcomes).toEqual(['new']);
    });

    it('pauses servers whose role was deleted while offline', async () => {
      guilds.add(activeGuild('g1'));
      permissions.result = { issues: ['role-not-found'], warnings: [] };
      await reconcile().execute(['g1']);
      expect(guilds.guilds.get('g1')?.pauseReason).toBe('role-deleted');
    });

    it('pauses servers whose channel was deleted while offline', async () => {
      guilds.add(activeGuild('g1'));
      permissions.result = { issues: ['channel-not-found'], warnings: [] };
      await reconcile().execute(['g1']);
      expect(guilds.guilds.get('g1')?.pauseReason).toBe('channel-deleted');
    });

    it('leaves servers alone when only permissions are missing', async () => {
      guilds.add(activeGuild('g1'));
      permissions.result = { issues: ['cannot-send-messages'], warnings: [] };
      await reconcile().execute(['g1']);
      expect(guilds.guilds.get('g1')?.status).toBe('active');
    });
  });

  describe('CheckGuildAccess', () => {
    it('reflects the server status', async () => {
      guilds.add(activeGuild('g1'));
      const check = new CheckGuildAccess(guilds);
      expect(await check.execute('g1')).toBe('allowed');
      expect(await check.execute('nope')).toBe('unconfigured');
    });
  });
});
