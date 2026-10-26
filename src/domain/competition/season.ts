import type { CompetitionId, SeasonId } from '../shared/ids.js';

/**
 * A season groups the tournaments that share one leaderboard: a league split
 * (regular season + playoffs) or a one-off event (Worlds, MSI) for a given year.
 */
export function seasonKeyOf(tournament: { readonly year: string; readonly split: string | null }): string {
  return tournament.split ? `${tournament.year} ${tournament.split}` : tournament.year;
}

export interface SeasonPeriod {
  readonly id: SeasonId;
  readonly competitionId: CompetitionId;
  readonly name: string;
  readonly firstMatchAt: Date;
  readonly lastMatchAt: Date;
  /** Last scheduled day of its tournaments (YYYY-MM-DD), null when one of them has no end date. */
  readonly endsOn: string | null;
}

/** The season being played, or the last one played; null before the first one starts. */
export function currentSeason<S extends SeasonPeriod>(seasons: readonly S[], now: Date): S | null {
  const started = seasons.filter((season) => season.firstMatchAt.getTime() <= now.getTime());
  return started.toSorted((a, b) => b.firstMatchAt.getTime() - a.firstMatchAt.getTime())[0] ?? null;
}

const UNDATED_SEASON_GRACE_MS = 2 * 86_400_000;

/**
 * A season is over once every match is decided (or cancelled) and its tournaments reached their end date,
 * so a split is not closed between the regular season and playoffs that are not scheduled yet.
 */
export function isSeasonOver(season: SeasonPeriod, allMatchesResolved: boolean, now: Date): boolean {
  if (!allMatchesResolved || season.lastMatchAt.getTime() > now.getTime()) return false;
  if (season.endsOn === null) return now.getTime() - season.lastMatchAt.getTime() >= UNDATED_SEASON_GRACE_MS;
  return season.endsOn <= now.toISOString().slice(0, 10);
}
