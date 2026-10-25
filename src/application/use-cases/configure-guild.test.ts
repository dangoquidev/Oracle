import { beforeEach, describe, expect, it } from 'vitest';
import type { Competition } from '../../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../../domain/competition/scoring.js';
import { activeGuild } from '../../test-support/builders.js';
import { InMemoryGuildRepository, StubPermissionChecker } from '../../test-support/fakes.js';
import { ConfigureGuild } from './configure-guild.js';
import { GetConfigurationDraft } from './get-configuration-draft.js';

const competitions: Competition[] = [
  { id: 'lec', name: 'LEC', source: { league: 'LoL EMEA Championship' }, scoring: DEFAULT_SCORING },
  { id: 'worlds', name: 'Worlds', source: { league: 'World Championship' }, scoring: DEFAULT_SCORING },
];

describe('ConfigureGuild', () => {
  let guilds: InMemoryGuildRepository;
  let permissions: StubPermissionChecker;
  let configure: ConfigureGuild;

  beforeEach(() => {
    guilds = new InMemoryGuildRepository();
    permissions = new StubPermissionChecker();
    configure = new ConfigureGuild(guilds, permissions, competitions);
  });

  it('activates the server with validated settings', async () => {
    permissions.result = { issues: [], warnings: ['cannot-use-external-emojis'] };
    const result = await configure.execute('g1', { pingRoleId: 'r', channelId: 'c', locale: 'en' });
    expect(result).toEqual({ ok: true, value: { warnings: ['cannot-use-external-emojis'] } });
    expect(guilds.guilds.get('g1')).toMatchObject({
      status: 'active',
      settings: { locale: 'en', pingRoleId: 'r' },
    });
    expect(permissions.calls).toEqual([{ guildId: 'g1', channelId: 'c', roleId: 'r' }]);
  });

  it('rejects invalid settings without checking permissions', async () => {
    const result = await configure.execute('g1', { channelId: 'c' });
    expect(result).toEqual({ ok: false, error: { kind: 'invalid-settings', errors: ['missing-role'] } });
    expect(permissions.calls).toEqual([]);
    expect(guilds.guilds.size).toBe(0);
  });

  it('refuses to save when the bot lacks permissions', async () => {
    permissions.result = { issues: ['cannot-mention-role'], warnings: [] };
    const result = await configure.execute('g1', { pingRoleId: 'r', channelId: 'c' });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'missing-permissions', issues: ['cannot-mention-role'] },
    });
    expect(guilds.guilds.size).toBe(0);
  });
});

describe('GetConfigurationDraft', () => {
  it('starts from defaults with every competition enabled', async () => {
    const draft = await new GetConfigurationDraft(new InMemoryGuildRepository(), competitions).execute('g1');
    expect(draft).toMatchObject({
      locale: 'fr',
      competitionIds: ['lec', 'worlds'],
      timeZone: 'Europe/Paris',
    });
    expect(draft.pingRoleId).toBeUndefined();
  });

  it('starts from current settings when reconfiguring', async () => {
    const guilds = new InMemoryGuildRepository().add(
      activeGuild('g1', { locale: 'en', competitionIds: ['lec'] }),
    );
    const draft = await new GetConfigurationDraft(guilds, competitions).execute('g1');
    expect(draft).toMatchObject({ locale: 'en', competitionIds: ['lec'], pingRoleId: 'role-1' });
  });
});
