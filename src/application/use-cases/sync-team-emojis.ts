import type { TeamId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { TeamEmojiStore } from '../ports/team-emoji-store.js';

/** Uploads per run: each one downloads a logo, so they are spread over the 6-hourly syncs. */
const UPLOADS_PER_RUN = 25;
/** Teams looked at per run: linking an emoji added by hand costs nothing. */
const TEAMS_PER_RUN = 200;

export interface EmojiReport {
  /** Teams that got their emoji in this run (found on the emoji servers or uploaded). */
  readonly linked: number;
  /** Emoji names still missing, for an admin to add by hand. */
  readonly missing: readonly string[];
}

/**
 * Gives the teams of recent and upcoming matches their logo emoji: an emoji already named after the
 * team on the emoji servers (e.g. added by hand) is used first, otherwise the logo is uploaded.
 */
export class SyncTeamEmojis {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly emojis: TeamEmojiStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<EmojiReport> {
    const teams = await this.calendar.findTeamsMissingEmoji(this.clock.now(), TEAMS_PER_RUN);
    if (teams.length === 0) return { linked: 0, missing: [] };

    const existing = await this.emojis.existing();
    let uploads = 0;
    let linked = 0;
    const missing: string[] = [];
    for (const team of teams) {
      const name = emojiNameFor(team.shortName);
      let emojiId = existing.get(name) ?? null;
      if (emojiId === null && team.logoUrl !== null && uploads < UPLOADS_PER_RUN) {
        uploads += 1;
        emojiId = await this.upload(team.id, name, team.logoUrl);
      }
      if (emojiId === null) {
        missing.push(name);
        continue;
      }
      await this.calendar.setTeamEmoji(team.id, emojiId);
      linked += 1;
    }
    if (linked > 0) this.logger.info({ linked }, 'Team emojis linked');
    return { linked, missing: missing.toSorted() };
  }

  private async upload(teamId: TeamId, name: string, logoUrl: string): Promise<string | null> {
    try {
      return await this.emojis.create(name, logoUrl);
    } catch (error) {
      // The reason only: a failed upload carries the whole image in its request body.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn({ teamId, team: name, reason }, 'Could not create team emoji');
      return null;
    }
  }
}

/**
 * Discord emoji names: 2–32 characters, letters, digits and underscores. Always upper case, so an
 * emoji added by hand is simply named after the team in capitals ("IG", not "iG").
 */
export function emojiNameFor(shortName: string): string {
  const cleaned = shortName
    .normalize('NFD')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase()
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : `team_${cleaned}`;
}
