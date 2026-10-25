import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localDateOf } from './time-zone.js';

describe('time zones', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Nowhere/Land')).toBe(false);
  });

  it('gives the local calendar date', () => {
    expect(localDateOf(new Date('2026-08-01T22:30:00Z'), 'Europe/Paris')).toBe('2026-08-02');
    expect(localDateOf(new Date('2026-08-01T22:30:00Z'), 'UTC')).toBe('2026-08-01');
  });
});
