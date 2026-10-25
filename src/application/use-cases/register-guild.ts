import type { GuildId } from '../../domain/shared/ids.js';
import type { GuildMessenger } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';

/** The bot joined a server: remember it and greet it. It stays inactive until /configure. */
export class RegisterGuild {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly messenger: GuildMessenger,
    private readonly logger: Logger,
  ) {}

  async execute(guildId: GuildId): Promise<void> {
    const shouldGreet = await this.guilds.register(guildId);
    if (!shouldGreet) return;
    try {
      await this.messenger.sendWelcome(guildId);
    } catch (error) {
      this.logger.warn({ guildId, err: error }, 'Could not send welcome message');
    }
  }
}
