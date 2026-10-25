import { describe, expect, it } from 'vitest';
import {
  decodeChoice,
  decodeConfigure,
  decodePrediction,
  encodeChoice,
  encodeConfigure,
  encodePrediction,
  type PredictionAction,
} from './custom-id.js';

describe('prediction custom ids', () => {
  const actions: PredictionAction[] = [
    { action: 'open', publicationId: 12 },
    { action: 'summary', publicationId: 12 },
    { action: 'go', publicationId: 12, index: 0 },
    { action: 'pick', publicationId: 12, matchId: 345, choice: { kind: 'winner', winner: 2 } },
    {
      action: 'pick',
      publicationId: 12,
      matchId: 345,
      choice: { kind: 'score', score: { team1: 2, team2: 1 } },
    },
  ];

  it.each(actions)('round-trips %o', (action) => {
    const encoded = encodePrediction(action);
    expect(encoded.length).toBeLessThanOrEqual(100);
    expect(decodePrediction(encoded)).toEqual(action);
  });

  it.each([
    'cfg:open:1',
    'pr:open:abc',
    'pr:open:0',
    'pr:go:1',
    'pr:go:1:-1',
    'pr:pick:1:0:w1',
    'pr:pick:1:5:x',
    'pr:nope:1:0',
  ])('rejects %s', (raw) => {
    expect(decodePrediction(raw)).toBeNull();
  });

  it('encodes choices compactly', () => {
    expect(encodeChoice({ kind: 'winner', winner: 1 })).toBe('w1');
    expect(encodeChoice({ kind: 'score', score: { team1: 3, team2: 2 } })).toBe('s3-2');
    expect(decodeChoice(undefined)).toBeNull();
  });
});

describe('configure custom ids', () => {
  it('round-trips actions with and without argument', () => {
    expect(decodeConfigure(encodeConfigure('nav', 'next'))).toEqual({ action: 'nav', arg: 'next' });
    expect(decodeConfigure(encodeConfigure('role'))).toEqual({ action: 'role', arg: null });
    expect(decodeConfigure('cfg:tz:America/Argentina/Buenos_Aires')).toEqual({
      action: 'tz',
      arg: 'America/Argentina/Buenos_Aires',
    });
  });

  it('rejects other scopes', () => {
    expect(decodeConfigure('pr:open:1')).toBeNull();
    expect(decodeConfigure('cfg')).toBeNull();
  });
});
