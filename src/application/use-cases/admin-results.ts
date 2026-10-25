import { accessOf } from '../../domain/guild/guild.js';
import type { MatchResult } from '../../domain/match/match.js';
import { isFinalScore, winnerOfScore } from '../../domain/match/series-score.js';
import type { GuildId, MatchId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { ResultOverrideRepository } from '../ports/result-override-repository.js';
import type { MatchView } from '../read-models/views.js';
import type { ScorePredictions } from './score-predictions.js';

/** What an admin decides about a match result on their server. */
export type ResultDecision =
  | { readonly kind: 'result'; readonly result: MatchResult }
  | { readonly kind: 'cancel' }
  /** Back to the data provider's result (undoes a correction or a cancellation). */
  | { readonly kind: 'provider' };

export interface ResultDecisionOutcome {
  readonly match: MatchView;
  readonly competitionName: string;
  readonly weekName: string;
  /** Predictions whose points changed. */
  readonly rescored: number;
}

export type ResultDecisionError =
  'guild-not-active' | 'match-not-found' | 'match-not-started' | 'invalid-result';

/** /admin result and /admin cancel: correct, cancel or restore a match result, then rescore. */
export class DecideMatchResult {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly overrides: ResultOverrideRepository,
    private readonly scorePredictions: ScorePredictions,
    private readonly clock: Clock,
  ) {}

  async execute(
    guildId: GuildId,
    adminId: UserId,
    matchId: MatchId,
    decision: ResultDecision,
  ): Promise<Result<ResultDecisionOutcome, ResultDecisionError>> {
    if (accessOf(await this.guilds.find(guildId)) !== 'allowed') return err('guild-not-active');
    const match = await this.calendar.findMatch(matchId);
    if (!match) return err('match-not-found');
    const [week] = await this.calendar.findWeekViews([match.weekId]);
    const view = week?.matches.find((candidate) => candidate.id === matchId);
    if (!week || !view) return err('match-not-found');

    const now = this.clock.now();
    if (decision.kind === 'result') {
      if (match.scheduledAt > now) return err('match-not-started');
      if (!isValidResult(decision.result, match.bestOf)) return err('invalid-result');
      await this.overrides.set(guildId, matchId, { kind: 'result', result: decision.result }, adminId, now);
    } else if (decision.kind === 'cancel') {
      await this.overrides.set(guildId, matchId, { kind: 'cancelled' }, adminId, now);
    } else {
      await this.overrides.clear(guildId, matchId);
    }

    const rescored = await this.scorePredictions.execute({ guildId, matchIds: [matchId] });
    return ok({ match: view, competitionName: week.competitionName, weekName: week.week.name, rescored });
  }
}

/** /admin recalc: rescore every prediction of the server since the beginning. */
export class RecalculatePoints {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly scorePredictions: ScorePredictions,
  ) {}

  async execute(guildId: GuildId): Promise<Result<number, 'guild-not-active'>> {
    if (accessOf(await this.guilds.find(guildId)) !== 'allowed') return err('guild-not-active');
    return ok(await this.scorePredictions.execute({ guildId, since: new Date(0) }));
  }
}

function isValidResult(result: MatchResult, bestOf: 1 | 3 | 5): boolean {
  if (bestOf === 1) return result.score === null;
  return (
    result.score !== null &&
    isFinalScore(result.score, bestOf) &&
    winnerOfScore(result.score) === result.winner
  );
}
