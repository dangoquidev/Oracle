import type { RefreshAnnouncements } from './refresh-announcements.js';
import type { EmojiReport, SyncTeamEmojis } from './sync-team-emojis.js';

/**
 * /admin sync: links the emojis added by hand right away, shows the logos still missing,
 * and refreshes posted announcements when logos were added.
 */
export class CheckTeamEmojis {
  constructor(
    private readonly emojis: SyncTeamEmojis,
    private readonly announcements: RefreshAnnouncements,
    /** False when no emoji server is configured: logos are then simply not used. */
    private readonly enabled: boolean,
  ) {}

  async execute(): Promise<EmojiReport | null> {
    if (!this.enabled) return null;
    const report = await this.emojis.execute();
    if (report.linked > 0) await this.announcements.executeForAll();
    return report;
  }
}
