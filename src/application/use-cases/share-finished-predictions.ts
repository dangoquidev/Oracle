import { accessOf } from '../../domain/guild/guild.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';
import type { GuildMessenger, SharedPredictions } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';
import type { PredictionJourney } from './get-prediction-journey.js';

/**
 * Posts a player's picks in the channel each time a pick leaves no open match of the announcement
 * without a prediction. Picks are public on purpose: the server chose to show them before the lock.
 */
export class ShareFinishedPredictions {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly messenger: GuildMessenger,
    private readonly logger: Logger,
  ) {}

  /** Returns true when the picks were posted. Never throws: the pick itself is already saved. */
  async execute(guildId: GuildId, userId: UserId, journey: PredictionJourney): Promise<boolean> {
    if (!hasFinished(journey)) return false;
    const guild = await this.guilds.find(guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return false;

    const groups: SharedPredictions['groups'][number][] = [];
    for (const item of journey.items) {
      if (!item.current) continue;
      const last = groups.at(-1);
      const pick = { match: item.match, choice: item.current };
      if (last?.competitionName === item.competitionName && last.weekName === item.weekName) {
        groups[groups.length - 1] = { ...last, picks: [...last.picks, pick] };
      } else {
        groups.push({ competitionName: item.competitionName, weekName: item.weekName, picks: [pick] });
      }
    }

    try {
      await this.messenger.sharePredictions({
        guildId,
        channelId: guild.settings.channelId,
        locale: guild.settings.locale,
        userId,
        groups,
      });
      return true;
    } catch (error) {
      this.logger.warn({ guildId, userId, err: error }, 'Could not share finished predictions');
      return false;
    }
  }
}

/** Every match still open to votes has a pick (and there was at least one to make). */
export function hasFinished(journey: PredictionJourney): boolean {
  const open = journey.items.filter((item) => item.state === 'open');
  return open.length > 0 && open.every((item) => item.current !== null);
}
