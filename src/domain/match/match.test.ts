import { describe, expect, it } from 'vitest';
import { hasKnownOpponents } from './match.js';

describe('hasKnownOpponents', () => {
  it('requires both teams', () => {
    expect(hasKnownOpponents({ team1Id: 1, team2Id: 2 })).toBe(true);
    expect(hasKnownOpponents({ team1Id: null, team2Id: 2 })).toBe(false);
    expect(hasKnownOpponents({ team1Id: 1, team2Id: null })).toBe(false);
  });
});
