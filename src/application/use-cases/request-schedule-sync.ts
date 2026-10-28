import type { GuildId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { Logger } from '../ports/logger.js';
import type { ScheduleSyncTrigger } from '../ports/schedule-sync-trigger.js';

export type SyncRequestError = 'throttled';

/**
 * /admin sync: queues a Leaguepedia sync right away instead of waiting for the next 6-hourly run.
 * The data is shared by every server (configured or not), so requests are throttled globally.
 */
export class RequestScheduleSync {
  constructor(
    private readonly trigger: ScheduleSyncTrigger,
    private readonly logger: Logger,
  ) {}

  async execute(guildId: GuildId, adminId: UserId): Promise<Result<void, SyncRequestError>> {
    if (!(await this.trigger.request())) return err('throttled');
    this.logger.info({ guildId, adminId }, 'Schedule sync requested by an admin');
    return ok(undefined);
  }
}
