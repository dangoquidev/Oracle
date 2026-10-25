import { accessOf } from '../../domain/guild/guild.js';
import type { GuildId, MatchId, UserId, WeekId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { LockOverrideRepository } from '../ports/lock-override-repository.js';
import type { MatchView } from '../read-models/views.js';

export type LockTarget =
  { readonly kind: 'week'; readonly weekId: WeekId } | { readonly kind: 'match'; readonly matchId: MatchId };

export interface SetLockOverrideCommand {
  readonly guildId: GuildId;
  readonly adminId: UserId;
  readonly target: LockTarget;
  readonly state: 'open' | 'closed';
}

export interface LockOverrideOutcome {
  readonly competitionName: string;
  readonly weekName: string;
  /** Matches whose votes were opened or closed (played matches are left alone). */
  readonly matches: readonly MatchView[];
}

export type SetLockOverrideError = 'guild-not-active' | 'target-not-found' | 'no-open-match';

/** Admin command: force votes open (until kick-off) or closed for a week or a single match. */
export class SetLockOverride {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly overrides: LockOverrideRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetLockOverrideCommand): Promise<Result<LockOverrideOutcome, SetLockOverrideError>> {
    const guild = await this.guilds.find(command.guildId);
    if (accessOf(guild) !== 'allowed') return err('guild-not-active');

    const weekId = await this.weekOf(command.target);
    if (weekId === null) return err('target-not-found');
    const [week] = await this.calendar.findWeekViews([weekId]);
    if (!week) return err('target-not-found');

    const targeted =
      command.target.kind === 'week'
        ? week.matches
        : week.matches.filter(
            (match) => command.target.kind === 'match' && match.id === command.target.matchId,
          );
    const now = this.clock.now();
    const affected = targeted.filter((match) => match.status === 'scheduled' && match.scheduledAt > now);
    if (affected.length === 0) return err('no-open-match');

    await this.overrides.set(
      command.guildId,
      affected.map((match) => match.id),
      { state: command.state, at: now },
      command.adminId,
    );
    return ok({ competitionName: week.competitionName, weekName: week.week.name, matches: affected });
  }

  private async weekOf(target: LockTarget): Promise<WeekId | null> {
    if (target.kind === 'week') return target.weekId;
    return (await this.calendar.findMatch(target.matchId))?.weekId ?? null;
  }
}
