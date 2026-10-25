import type { CompetitionId } from '../shared/ids.js';
import type { ScoringRules } from './scoring.js';

/** Where a competition's tournaments come from, in data-provider terms. */
export interface CompetitionSource {
  /** Provider league name, e.g. "LoL EMEA Championship". */
  readonly league: string;
  /** Optional SQL LIKE pattern restricting tournament pages within the league. */
  readonly tournamentPagePattern?: string;
}

export interface Competition {
  readonly id: CompetitionId;
  readonly name: string;
  readonly source: CompetitionSource;
  readonly scoring: ScoringRules;
}
