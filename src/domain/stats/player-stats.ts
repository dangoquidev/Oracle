import type { BestOf } from '../match/best-of.js';
import type { ScoredOutcome } from '../scoring/score-prediction.js';
import type { CompetitionId, MatchId, TeamId, WeekId } from '../shared/ids.js';

/** One judged prediction of a player, with what the statistics need about its match. */
export interface StatsPick {
  readonly matchId: MatchId;
  readonly competitionId: CompetitionId;
  readonly weekId: WeekId;
  readonly scheduledAt: Date;
  readonly bestOf: BestOf;
  /** Team the player picked to win, when known. */
  readonly pickedTeamId: TeamId | null;
  readonly outcome: ScoredOutcome;
}

export interface PickRecord {
  readonly points: number;
  readonly predictions: number;
  readonly correctWinners: number;
  readonly exactScores: number;
  /** Predictions on Bo3/Bo5, where an exact score was possible. */
  readonly seriesPredictions: number;
}

export interface CompetitionRecord extends PickRecord {
  readonly competitionId: CompetitionId;
}

export interface PlayerStats {
  readonly record: PickRecord;
  readonly byCompetition: readonly CompetitionRecord[];
  /** Right winners in a row, up to the latest judged match. */
  readonly currentStreak: number;
  readonly bestStreak: number;
  /** Week with the most points (the latest one on a tie). */
  readonly bestWeek: { readonly weekId: WeekId; readonly points: number } | null;
  /** Team most often picked to win, and how often that pick was right. */
  readonly favouriteTeam: {
    readonly teamId: TeamId;
    readonly picks: number;
    readonly correct: number;
  } | null;
}

const EMPTY_RECORD: PickRecord = {
  points: 0,
  predictions: 0,
  correctWinners: 0,
  exactScores: 0,
  seriesPredictions: 0,
};

export function computePlayerStats(picks: readonly StatsPick[]): PlayerStats {
  const ordered = picks.toSorted(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.matchId - b.matchId,
  );
  return {
    record: recordOf(ordered),
    byCompetition: byCompetition(ordered),
    ...streaks(ordered),
    bestWeek: bestWeek(ordered),
    favouriteTeam: favouriteTeam(ordered),
  };
}

/** Share of `part` in `total`, as a rounded percentage (0 when there is nothing to compare). */
export function percentage(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function recordOf(picks: readonly StatsPick[]): PickRecord {
  return picks.reduce<PickRecord>(
    (record, pick) => ({
      points: record.points + pick.outcome.points,
      predictions: record.predictions + 1,
      correctWinners: record.correctWinners + (pick.outcome.correctWinner ? 1 : 0),
      exactScores: record.exactScores + (pick.outcome.exactScore ? 1 : 0),
      seriesPredictions: record.seriesPredictions + (pick.bestOf > 1 ? 1 : 0),
    }),
    EMPTY_RECORD,
  );
}

/** Competitions with the most points first. */
function byCompetition(picks: readonly StatsPick[]): CompetitionRecord[] {
  const groups = Map.groupBy(picks, (pick) => pick.competitionId);
  return [...groups]
    .map(([competitionId, group]) => ({ competitionId, ...recordOf(group) }))
    .toSorted((a, b) => b.points - a.points || a.competitionId.localeCompare(b.competitionId));
}

function streaks(picks: readonly StatsPick[]): Pick<PlayerStats, 'currentStreak' | 'bestStreak'> {
  let current = 0;
  let best = 0;
  for (const pick of picks) {
    current = pick.outcome.correctWinner ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { currentStreak: current, bestStreak: best };
}

function bestWeek(picks: readonly StatsPick[]): PlayerStats['bestWeek'] {
  let best: PlayerStats['bestWeek'] = null;
  // Picks are chronological, so ">=" keeps the latest week on a tie.
  for (const [weekId, group] of Map.groupBy(picks, (pick) => pick.weekId)) {
    const points = recordOf(group).points;
    if (best === null || points >= best.points) best = { weekId, points };
  }
  return best;
}

function favouriteTeam(picks: readonly StatsPick[]): PlayerStats['favouriteTeam'] {
  const teams = [...Map.groupBy(picks, (pick) => pick.pickedTeamId)].flatMap(([teamId, group]) =>
    teamId === null
      ? []
      : [{ teamId, picks: group.length, correct: group.filter((pick) => pick.outcome.correctWinner).length }],
  );
  return (
    teams.toSorted((a, b) => b.picks - a.picks || b.correct - a.correct || a.teamId - b.teamId)[0] ?? null
  );
}
