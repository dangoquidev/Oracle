import { describe, expect, it } from 'vitest';
import { seasonKeyOf } from './season.js';

describe('seasonKeyOf', () => {
  it('groups league tournaments by split', () => {
    expect(seasonKeyOf({ year: '2026', split: 'Summer' })).toBe('2026 Summer');
  });

  it('groups split-less events by year', () => {
    expect(seasonKeyOf({ year: '2026', split: null })).toBe('2026');
    expect(seasonKeyOf({ year: '2026', split: '' })).toBe('2026');
  });
});
