import type { Competition } from '../../domain/competition/competition.js';
import { validateSettings, type GuildSettings } from '../../domain/guild/guild-settings.js';
import type { Guild } from '../../domain/guild/guild.js';
import { applySettingsPatch, type SettingsPatch } from '../../domain/guild/settings-patch.js';
import type { GuildId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { PublicationWarning } from '../ports/guild-permission-checker.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { GuildPermissionChecker } from '../ports/guild-permission-checker.js';
import type { ConfigureGuildError } from './configure-guild.js';

/** A server the bot was configured on, running or paused. */
export type ConfiguredGuild = Guild & { readonly settings: GuildSettings };

export type UpdateGuildSettingsError = { readonly kind: 'not-configured' } | ConfigureGuildError;

export interface SettingsUpdate {
  readonly settings: GuildSettings;
  readonly warnings: readonly PublicationWarning[];
  /** The server was paused and runs again. */
  readonly reactivated: boolean;
}

/** Current settings of a configured server (for /config without changes). */
export class GetGuildSettings {
  constructor(private readonly guilds: GuildRepository) {}

  async execute(guildId: GuildId): Promise<ConfiguredGuild | null> {
    const guild = await this.guilds.find(guildId);
    return configured(guild);
  }
}

/**
 * /config: changes one setting of a configured server. The result must still be valid and
 * publishable; saving it also reactivates a paused server once the missing role or channel is replaced.
 */
export class UpdateGuildSettings {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly permissions: GuildPermissionChecker,
    private readonly competitions: readonly Competition[],
  ) {}

  async execute(
    guildId: GuildId,
    patch: SettingsPatch,
  ): Promise<Result<SettingsUpdate, UpdateGuildSettingsError>> {
    const guild = configured(await this.guilds.find(guildId));
    if (!guild) return err({ kind: 'not-configured' });

    const validation = validateSettings(
      applySettingsPatch(guild.settings, patch),
      new Set(this.competitions.map((competition) => competition.id)),
    );
    if (!validation.ok) return err({ kind: 'invalid-settings', errors: validation.error });

    const settings = validation.value;
    const check = await this.permissions.checkPublication(guildId, settings.channelId, settings.pingRoleId);
    if (check.issues.length > 0) return err({ kind: 'missing-permissions', issues: check.issues });

    await this.guilds.saveSettings(guildId, settings);
    return ok({ settings, warnings: check.warnings, reactivated: guild.status === 'paused' });
  }
}

function configured(guild: Guild | null): ConfiguredGuild | null {
  if (!guild?.settings || (guild.status !== 'active' && guild.status !== 'paused')) return null;
  return { ...guild, settings: guild.settings };
}
