import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { TeamEmojiStore } from '../ports/team-emoji-store.js';

const BATCH_SIZE = 25;

/** Uploads team logos of upcoming matches as custom emojis, a batch at a time. */
export class SyncTeamEmojis {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly emojis: TeamEmojiStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<number> {
    const teams = await this.calendar.findTeamsMissingEmoji(this.clock.now(), BATCH_SIZE);
    let created = 0;
    for (const team of teams) {
      try {
        const emojiId = await this.emojis.create(emojiNameFor(team.shortName), team.logoUrl);
        await this.calendar.setTeamEmoji(team.id, emojiId);
        created += 1;
      } catch (error) {
        // The reason only: a failed upload carries the whole image in its request body.
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn({ teamId: team.id, team: team.shortName, reason }, 'Could not create team emoji');
      }
    }
    if (created > 0) this.logger.info({ created }, 'Team emojis created');
    return created;
  }
}

/** Discord emoji names: 2–32 characters, letters, digits and underscores. */
export function emojiNameFor(shortName: string): string {
  const cleaned = shortName
    .normalize('NFD')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : `team_${cleaned}`;
}
