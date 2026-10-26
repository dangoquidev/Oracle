import { accessOf } from '../../domain/guild/guild.js';
import { MAX_BAN_REASON_LENGTH } from '../../domain/guild/player-ban.js';
import type { GuildId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { BanRepository } from '../ports/ban-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';

export interface BanCommand {
  readonly guildId: GuildId;
  readonly adminId: UserId;
  readonly userId: UserId;
  readonly reason: string | null;
}

export type BanError = 'guild-not-active' | 'cannot-ban-self';
export type BanOutcome = 'banned' | 'already-banned';
export type UnbanOutcome = 'unbanned' | 'not-banned';

/** /admin ban and /admin unban: exclude a player from the server's game, or let them back in. */
export class ManagePlayerBans {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly bans: BanRepository,
    private readonly clock: Clock,
  ) {}

  async ban(command: BanCommand): Promise<Result<BanOutcome, BanError>> {
    if (accessOf(await this.guilds.find(command.guildId)) !== 'allowed') return err('guild-not-active');
    if (command.userId === command.adminId) return err('cannot-ban-self');
    const reason = command.reason?.trim().slice(0, MAX_BAN_REASON_LENGTH) ?? '';
    const created = await this.bans.ban({
      guildId: command.guildId,
      userId: command.userId,
      bannedBy: command.adminId,
      reason: reason === '' ? null : reason,
      bannedAt: this.clock.now(),
    });
    return ok(created ? 'banned' : 'already-banned');
  }

  async unban(guildId: GuildId, userId: UserId): Promise<Result<UnbanOutcome, 'guild-not-active'>> {
    if (accessOf(await this.guilds.find(guildId)) !== 'allowed') return err('guild-not-active');
    return ok((await this.bans.unban(guildId, userId)) ? 'unbanned' : 'not-banned');
  }
}
