import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/** `SET col = excluded.col` for every listed column of an upsert. */
export function excludedColumns<T extends PgTable, K extends keyof T['_']['columns'] & string>(
  table: T,
  keys: readonly K[],
): Record<K, SQL> {
  const columns = getTableColumns(table);
  return Object.fromEntries(
    keys.map((key) => [key, sql.raw(`excluded."${(columns[key] as { name: string }).name}"`)]),
  ) as Record<K, SQL>;
}

export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}
