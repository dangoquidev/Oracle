import { describe, expect, it } from 'vitest';
import { currentSeason, isSeasonOver, seasonKeyOf, type SeasonPeriod } from './season.js';

describe('seasonKeyOf', () => {
  it('groups league tournaments by split', () => {
    expect(seasonKeyOf({ year: '2026', split: 'Summer' })).toBe('2026 Summer');
  });

  it('groups split-less events by year', () => {
    expect(seasonKeyOf({ year: '2026', split: null })).toBe('2026');
    expect(seasonKeyOf({ year: '2026', split: '' })).toBe('2026');
  });
});

const season = (overrides: Partial<SeasonPeriod> = {}): SeasonPeriod => ({
  id: 1,
  competitionId: 'lec',
  name: '2026 Spring',
  firstMatchAt: new Date('2026-03-01T17:00:00Z'),
  lastMatchAt: new Date('2026-04-20T17:00:00Z'),
  endsOn: '2026-04-20',
  ...overrides,
});

describe('currentSeason', () => {
  const spring = season();
  const summer = season({ id: 2, name: '2026 Summer', firstMatchAt: new Date('2026-06-10T17:00:00Z') });

  it('picks the latest season that started', () => {
    expect(currentSeason([summer, spring], new Date('2026-05-01T00:00:00Z'))).toBe(spring);
    expect(currentSeason([spring, summer], new Date('2026-06-11T00:00:00Z'))).toBe(summer);
  });

  it('has no current season before the first one starts', () => {
    expect(currentSeason([spring], new Date('2026-01-01T00:00:00Z'))).toBeNull();
  });
});

describe('isSeasonOver', () => {
  it('waits for every result and for the tournaments end date', () => {
    expect(isSeasonOver(season(), true, new Date('2026-04-20T20:00:00Z'))).toBe(true);
    expect(isSeasonOver(season(), false, new Date('2026-04-20T20:00:00Z'))).toBe(false);
    expect(isSeasonOver(season({ endsOn: '2026-04-27' }), true, new Date('2026-04-21T00:00:00Z'))).toBe(
      false,
    );
  });

  it('is never over before its last match', () => {
    expect(isSeasonOver(season(), true, new Date('2026-04-20T16:00:00Z'))).toBe(false);
  });

  it('gives undated seasons two days after their last match', () => {
    const undated = season({ endsOn: null });
    expect(isSeasonOver(undated, true, new Date('2026-04-21T17:00:00Z'))).toBe(false);
    expect(isSeasonOver(undated, true, new Date('2026-04-22T17:00:00Z'))).toBe(true);
  });
});
