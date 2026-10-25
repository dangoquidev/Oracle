import { pauseReasonForDeletion } from '../../domain/guild/guild.js';
import type { ChannelId, GuildId, RoleId } from '../../domain/shared/ids.js';
import type { GuildMessenger } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';

export interface DeletedResource {
  readonly roleId?: RoleId;
  readonly channelId?: ChannelId;
}

/** A role or channel was deleted: pause the server if it was the configured one. */
export class HandleResourceDeleted {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly messenger: GuildMessenger,
    private readonly logger: Logger,
  ) {}

  async execute(guildId: GuildId, deleted: DeletedResource): Promise<void> {
    const guild = await this.guilds.find(guildId);
    if (guild?.status !== 'active' || !guild.settings) return;

    const reason = pauseReasonForDeletion(guild.settings, deleted);
    if (!reason) return;

    await this.guilds.pause(guildId, reason);
    this.logger.warn({ guildId, reason }, 'Guild paused');
    try {
      await this.messenger.notifyPaused(guildId, reason, guild.settings.locale);
    } catch (error) {
      this.logger.warn({ guildId, err: error }, 'Could not notify admins about pause');
    }
  }
}
