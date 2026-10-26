import { rankTallies, type LeaderboardEntry } from '../../domain/leaderboard/leaderboard.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';
import type { BanRepository } from '../ports/ban-repository.js';
import type { LeaderboardQuery, TallyFilter } from '../ports/leaderboard-query.js';

/** Ranked standings of a server, banned players left out. */
export class StandingsReader {
  constructor(
    private readonly leaderboards: LeaderboardQuery,
    private readonly bans: BanRepository,
  ) {}

  async rank(guildId: GuildId, filter: TallyFilter): Promise<LeaderboardEntry[]> {
    const [tallies, banned] = await Promise.all([
      this.leaderboards.tally(guildId, filter),
      this.bans.bannedIds(guildId),
    ]);
    return rankTallies(tallies.filter((tally) => !banned.has(tally.userId)));
  }

  bannedIds(guildId: GuildId): Promise<ReadonlySet<UserId>> {
    return this.bans.bannedIds(guildId);
  }
}
