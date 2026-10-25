import type { Competition } from '../../domain/competition/competition.js';
import {
  validateSettings,
  type GuildSettingsDraft,
  type SettingsError,
} from '../../domain/guild/guild-settings.js';
import type { GuildId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type {
  GuildPermissionChecker,
  PublicationIssue,
  PublicationWarning,
} from '../ports/guild-permission-checker.js';
import type { GuildRepository } from '../ports/guild-repository.js';

export type ConfigureGuildError =
  | { readonly kind: 'invalid-settings'; readonly errors: readonly SettingsError[] }
  | { readonly kind: 'missing-permissions'; readonly issues: readonly PublicationIssue[] };

/** Validates the wizard draft and the bot's permissions, then activates the server. */
export class ConfigureGuild {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly permissions: GuildPermissionChecker,
    private readonly competitions: readonly Competition[],
  ) {}

  async execute(
    guildId: GuildId,
    draft: GuildSettingsDraft,
  ): Promise<Result<{ readonly warnings: readonly PublicationWarning[] }, ConfigureGuildError>> {
    const validation = validateSettings(
      draft,
      new Set(this.competitions.map((competition) => competition.id)),
    );
    if (!validation.ok) return err({ kind: 'invalid-settings', errors: validation.error });

    const settings = validation.value;
    const check = await this.permissions.checkPublication(guildId, settings.channelId, settings.pingRoleId);
    if (check.issues.length > 0) return err({ kind: 'missing-permissions', issues: check.issues });

    await this.guilds.saveSettings(guildId, settings);
    return ok({ warnings: check.warnings });
  }
}
