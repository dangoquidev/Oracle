export type BestOf = 1 | 3 | 5;

export function parseBestOf(value: number): BestOf | null {
  return value === 1 || value === 3 || value === 5 ? value : null;
}

export function winsNeeded(bestOf: BestOf): number {
  return (bestOf + 1) / 2;
}
