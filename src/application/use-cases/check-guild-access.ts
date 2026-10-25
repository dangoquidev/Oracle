import { accessOf, type GuildAccess } from '../../domain/guild/guild.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { GuildRepository } from '../ports/guild-repository.js';

export class CheckGuildAccess {
  constructor(private readonly guilds: GuildRepository) {}

  async execute(guildId: GuildId): Promise<GuildAccess> {
    return accessOf(await this.guilds.find(guildId));
  }
}
