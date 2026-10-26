import { describe, expect, it } from 'vitest';
import { stageOf, weekLabel } from './prediction-week.js';

describe('stageOf', () => {
  it('names the stage after the season name', () => {
    expect(stageOf('Worlds 2026 Main Event', 'Worlds 2026')).toBe('Main Event');
    expect(stageOf('Worlds 2026 Play-In', 'Worlds 2026')).toBe('Play-In');
    expect(stageOf('LEC 2026 Summer Playoffs', 'LEC 2026 Summer')).toBe('Playoffs');
    expect(stageOf('lec 2026 summer - Playoffs', 'LEC 2026 Summer')).toBe('Playoffs');
  });

  it('has no stage for the main tournament or unrelated names', () => {
    expect(stageOf('LEC 2026 Summer', 'LEC 2026 Summer')).toBeNull();
    expect(stageOf('LoL EMEA Championship 2026', 'LEC 2026 Summer')).toBeNull();
  });
});

describe('weekLabel', () => {
  it('prefixes the week with its stage', () => {
    expect(weekLabel('Round 1', 'Main Event')).toBe('Main Event · Round 1');
    expect(weekLabel('Week 3', null)).toBe('Week 3');
  });
});
