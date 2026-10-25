import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { COMPETITIONS } from '../../../src/config/competitions.js';
import {
  connectDatabase,
  runMigrations,
  type DatabaseHandle,
} from '../../../src/infrastructure/db/client.js';
import { seedCompetitions } from '../../../src/infrastructure/repositories/competition-seeder.js';

export interface TestDatabase {
  readonly handle: DatabaseHandle;
  /** Empties every table but the competition catalog. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:18-alpine').start();
  const handle = connectDatabase(container.getConnectionUri());
  await runMigrations(handle.db, 'drizzle');
  await seedCompetitions(handle.db, COMPETITIONS);

  return {
    handle,
    reset: async () => {
      await handle.db.execute(
        sql`truncate result_overrides, dispatch_log, lock_overrides, publication_weeks, publications, predictions, guild_competitions, guilds, matches, weeks, teams, tournaments, seasons restart identity cascade`,
      );
    },
    stop: async () => {
      await handle.close();
      await container.stop();
    },
  };
}
