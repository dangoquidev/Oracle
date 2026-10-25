import { accessOf } from '../../domain/guild/guild.js';
import { isLockedAt } from '../../domain/lock/lock-policy.js';
import { hasKnownOpponents } from '../../domain/match/match.js';
import type { Prediction } from '../../domain/prediction/prediction.js';
import { isChoiceValidFor, type PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import type { LockCalculatorFactory } from './lock-calculator.js';

export interface SubmitPredictionCommand {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly matchId: MatchId;
  readonly choice: PredictionChoice;
  /** Timestamp of the Discord interaction, which decides whether the vote beat the lock. */
  readonly submittedAt: Date;
}

export type SubmitPredictionError =
  | 'guild-not-active'
  | 'match-not-found'
  | 'opponents-unknown'
  | 'match-not-open'
  | 'invalid-choice'
  | 'locked';

/** Records or replaces a user's prediction, as long as the match is not locked. */
export class SubmitPrediction {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly predictions: PredictionRepository,
    private readonly locks: LockCalculatorFactory,
  ) {}

  async execute(command: SubmitPredictionCommand): Promise<Result<Prediction, SubmitPredictionError>> {
    const guild = await this.guilds.find(command.guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return err('guild-not-active');

    const match = await this.calendar.findMatch(command.matchId);
    if (!match) return err('match-not-found');
    if (!hasKnownOpponents(match)) return err('opponents-unknown');
    if (match.status !== 'scheduled') return err('match-not-open');
    if (!isChoiceValidFor(command.choice, match.bestOf)) return err('invalid-choice');

    const lockAt = await this.locks.forGuild(guild.id, guild.settings).lockAtOf(match);
    if (isLockedAt(lockAt, command.submittedAt)) return err('locked');

    const prediction: Prediction = {
      guildId: command.guildId,
      userId: command.userId,
      matchId: command.matchId,
      choice: command.choice,
      submittedAt: command.submittedAt,
    };
    await this.predictions.save(prediction);
    return ok(prediction);
  }
}
