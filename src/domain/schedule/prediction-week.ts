import type { CompetitionId, WeekId } from '../shared/ids.js';

/** A week as defined by the data provider's calendar (e.g. "Week 3", "Swiss Round 2"). */
export interface PredictionWeek {
  readonly id: WeekId;
  readonly competitionId: CompetitionId;
  /** Display name, prefixed with the stage when there is one (e.g. "Main Event · Round 1"). */
  readonly name: string;
  /** Scheduled time of the week's first match. */
  readonly startsAt: Date;
  /** Scheduled time of the week's last match. */
  readonly endsAt: Date;
}

/**
 * Stage of a season a tournament stands for, e.g. "Main Event" for "Worlds 2026 Main Event" in
 * season "Worlds 2026", or "Playoffs" in a split; null for the season's main tournament.
 */
export function stageOf(tournamentName: string, seasonName: string): string | null {
  const name = tournamentName.trim();
  if (!name.toLowerCase().startsWith(seasonName.trim().toLowerCase())) return null;
  const stage = name
    .slice(seasonName.trim().length)
    .replace(/^[\s\-–:·]+/u, '')
    .trim();
  return stage === '' ? null : stage;
}

/** Week name shown to players: stages reuse week names ("Round 1" in both Play-In and Main Event). */
export function weekLabel(weekName: string, stage: string | null): string {
  return stage === null ? weekName : `${stage} · ${weekName}`;
}
