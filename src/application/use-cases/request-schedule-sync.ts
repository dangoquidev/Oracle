import { accessOf } from '../../domain/guild/guild.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';
import type { ScheduleSyncTrigger } from '../ports/schedule-sync-trigger.js';

export type SyncRequestError = 'guild-not-active' | 'throttled';

/**
 * /admin sync: queues a Leaguepedia sync right away instead of waiting for the next 6-hourly run.
 * The data is shared by every server, so requests are throttled globally.
 */
export class RequestScheduleSync {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly trigger: ScheduleSyncTrigger,
    private readonly logger: Logger,
  ) {}

  async execute(guildId: GuildId, adminId: UserId): Promise<Result<void, SyncRequestError>> {
    if (accessOf(await this.guilds.find(guildId)) !== 'allowed') return err('guild-not-active');
    if (!(await this.trigger.request())) return err('throttled');
    this.logger.info({ guildId, adminId }, 'Schedule sync requested by an admin');
    return ok(undefined);
  }
}
