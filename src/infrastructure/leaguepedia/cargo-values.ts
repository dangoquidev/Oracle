/** Quotes a value for a Cargo `where` clause. */
export function cargoString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function cargoList(values: readonly string[]): string {
  return `(${values.map(cargoString).join(', ')})`;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

export function parseIntOrNull(value: string | null | undefined): number | null {
  const text = blankToNull(value);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseFlag(value: string | null | undefined): boolean {
  const text = blankToNull(value)?.toLowerCase();
  return text === '1' || text === 'yes' || text === 'true';
}

/** Cargo datetimes are "YYYY-MM-DD HH:MM:SS" in UTC. */
export function parseUtcDateTime(value: string | null | undefined): Date | null {
  const text = blankToNull(value);
  if (text === null) return null;
  const date = new Date(`${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toCargoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
