/**
 * A season groups the tournaments that share one leaderboard: a league split
 * (regular season + playoffs) or a one-off event (Worlds, MSI) for a given year.
 */
export function seasonKeyOf(tournament: { readonly year: string; readonly split: string | null }): string {
  return tournament.split ? `${tournament.year} ${tournament.split}` : tournament.year;
}
