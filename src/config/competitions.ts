import type { Competition } from '../domain/competition/competition.js';
import { DEFAULT_SCORING } from '../domain/competition/scoring.js';

/**
 * Catalog of supported competitions. Adding a league (LCK, LPL, MSI, LFL…) is a new entry here:
 * the provider league name, an optional tournament page filter, and the scoring rules.
 * `League` values come from Leaguepedia's Tournaments table.
 */
export const COMPETITIONS: readonly Competition[] = [
  {
    id: 'worlds',
    name: 'Worlds',
    // Regional qualifiers are filed under the same league; keep the event itself (Play-In + Main Event).
    source: { league: 'World Championship', tournamentPagePattern: '% Season World Championship/%' },
    scoring: DEFAULT_SCORING,
  },
  {
    id: 'lec',
    name: 'LEC',
    source: { league: 'LoL EMEA Championship' },
    scoring: DEFAULT_SCORING,
  },
];
