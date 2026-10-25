import type { Competition } from '../../domain/competition/competition.js';
import { defaultSettings, type GuildSettingsDraft } from '../../domain/guild/guild-settings.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { GuildRepository } from '../ports/guild-repository.js';

/** Starting point of the setup wizard: current settings, or defaults on first setup. */
export class GetConfigurationDraft {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly competitions: readonly Competition[],
  ) {}

  async execute(guildId: GuildId): Promise<GuildSettingsDraft> {
    const guild = await this.guilds.find(guildId);
    if (guild?.settings) return { ...guild.settings };
    return { ...defaultSettings(this.competitions.map((competition) => competition.id)) };
  }
}
