import { describe, expect, it } from 'vitest';
import { formatDuration } from './fr.js';
import { localeFor, messages, supportedLocale } from './index.js';

describe('i18n', () => {
  it('maps Discord locales', () => {
    expect(supportedLocale('fr')).toBe('fr');
    expect(supportedLocale('en-GB')).toBe('en');
    expect(supportedLocale('de')).toBeNull();
    expect(supportedLocale(undefined)).toBeNull();
  });

  it('prefers the user locale, then the server one, then French', () => {
    expect(localeFor('en-US', 'fr')).toBe('en');
    expect(localeFor('ko', 'en')).toBe('en');
    expect(localeFor(null, null)).toBe('fr');
  });

  it('exposes both catalogs', () => {
    expect(messages('fr').configure.confirm).toBe('Valider');
    expect(messages('en').configure.confirm).toBe('Confirm');
  });

  it('formats durations', () => {
    expect(formatDuration(0, 'min', 'h', 'j')).toBe('0 min');
    expect(formatDuration(45, 'min', 'h', 'j')).toBe('45 min');
    expect(formatDuration(120, 'min', 'h', 'j')).toBe('2 h');
    expect(formatDuration(90, 'min', 'h', 'j')).toBe('1 h 30');
    expect(formatDuration(1440, 'min', 'h', 'j')).toBe('1 j');
  });
});
