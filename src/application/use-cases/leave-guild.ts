import type { GuildId } from '../../domain/shared/ids.js';
import type { GuildRepository } from '../ports/guild-repository.js';

/** The bot was removed from a server; its data is kept for history. */
export class LeaveGuild {
  constructor(private readonly guilds: GuildRepository) {}

  async execute(guildId: GuildId): Promise<void> {
    await this.guilds.markLeft(guildId);
  }
}
