import type { Competition } from '../../domain/competition/competition.js';
import type { Database } from '../db/client.js';
import { competitions } from '../db/schema.js';
import { excludedColumns } from './sql-helpers.js';

/** Mirrors the competition catalog into the database so other tables can reference it. */
export async function seedCompetitions(db: Database, catalog: readonly Competition[]): Promise<void> {
  if (catalog.length === 0) return;
  await db
    .insert(competitions)
    .values(catalog.map(({ id, name, source, scoring }) => ({ id, name, source, scoring })))
    .onConflictDoUpdate({
      target: competitions.id,
      set: excludedColumns(competitions, ['name', 'source', 'scoring']),
    });
}
