import { describe, expect, it } from 'vitest';
import type {
  JourneyItem,
  PredictionJourney,
} from '../../../application/use-cases/get-prediction-journey.js';
import { choicesFor } from '../../../domain/prediction/prediction-choice.js';
import { match, matchViewOf, team } from '../../../test-support/builders.js';
import { decodePrediction } from '../components/custom-id.js';
import {
  clampIndex,
  renderJourneyStep,
  renderJourneySummary,
  startIndex,
} from './prediction-journey-view.js';

const item = (id: number, overrides: Partial<JourneyItem> = {}): JourneyItem => {
  const source = match({ id, bestOf: overrides.match?.bestOf ?? 1 });
  return {
    match: { ...matchViewOf(source), team1: { ...team(10, 'G2'), emojiId: '111' }, team2: team(20, 'FNC') },
    competitionName: 'LEC',
    weekName: 'Week 1',
    lockAt: new Date('2026-08-01T14:00:00Z'),
    state: 'open',
    choices: choicesFor(source.bestOf),
    current: null,
    ...overrides,
  };
};

const journey = (items: JourneyItem[]): PredictionJourney => ({
  publicationId: 7,
  locale: 'fr',
  timeZone: 'Europe/Paris',
  items,
});

const buttonsOf = (view: ReturnType<typeof renderJourneyStep>) =>
  view.components
    .flatMap((row) => row.toJSON().components)
    .map(
      (component) =>
        component as {
          custom_id: string;
          label: string;
          style: number;
          disabled?: boolean;
          emoji?: { id?: string };
        },
    );

describe('prediction journey view', () => {
  it('starts on the first open match without a pick', () => {
    const picked = item(1, { current: { kind: 'winner', winner: 1 } });
    expect(startIndex(journey([picked, item(2, { state: 'locked' }), item(3)]))).toBe(2);
    expect(startIndex(journey([picked, item(2)]))).toBe(1);
    expect(startIndex(journey([item(1, { state: 'locked' }), picked]))).toBe(1);
    expect(startIndex(journey([item(1, { state: 'locked' })]))).toBe(0);
  });

  it('clamps indexes into range', () => {
    expect(clampIndex(journey([item(1), item(2)]), 5)).toBe(1);
    expect(clampIndex(journey([item(1)]), -1)).toBe(0);
    expect(clampIndex(journey([]), 3)).toBe(0);
  });

  it('renders Bo1 winner buttons with logos, highlighting the current pick', () => {
    const view = renderJourneyStep(
      journey([item(1, { current: { kind: 'winner', winner: 2 } })]),
      0,
      'fr',
      true,
    );
    const [g2, fnc] = buttonsOf(view);
    expect([g2?.label, fnc?.label]).toEqual(['G2', 'FNC']);
    expect(g2?.emoji?.id).toBe('111');
    expect(fnc?.style).toBe(3); // success
    expect(decodePrediction(fnc?.custom_id ?? '')).toEqual({
      action: 'pick',
      publicationId: 7,
      matchId: 1,
      choice: { kind: 'winner', winner: 2 },
    });
    expect(view.embeds[0]?.toJSON().title).toBe('Match 1/1');
  });

  it('renders Bo5 score buttons on two rows plus navigation', () => {
    const bo5 = item(1, { match: { ...item(1).match, bestOf: 5 }, choices: choicesFor(5) });
    const view = renderJourneyStep(journey([bo5, item(2)]), 0, 'en', false);
    expect(view.components).toHaveLength(3);
    expect(
      buttonsOf(view)
        .slice(0, 6)
        .map((b) => b.label),
    ).toEqual(['3-0 G2', '3-1 G2', '3-2 G2', '3-2 FNC', '3-1 FNC', '3-0 FNC']);
    const nav = buttonsOf(view).slice(6);
    expect(nav.map((b) => b.disabled ?? false)).toEqual([true, false, false]);
  });

  it('disables picks on locked matches and explains why', () => {
    const view = renderJourneyStep(journey([item(1, { state: 'locked' })]), 0, 'fr', false, 'note');
    expect(
      buttonsOf(view)
        .slice(0, 2)
        .every((b) => b.disabled),
    ).toBe(true);
    expect(view.embeds[0]?.toJSON().description).toContain('Votes fermés');
    expect(view.embeds[0]?.toJSON().description).toContain('note');
  });

  it('falls back to the summary for an out of range index', () => {
    const view = renderJourneyStep(journey([item(1)]), 3, 'fr', false);
    expect(view.embeds[0]?.toJSON().title).toBe('Récap de tes pronos');
  });

  it('summarises picks and links back to the matches', () => {
    const view = renderJourneySummary(
      journey([item(1, { current: { kind: 'winner', winner: 1 } }), item(2), item(3, { state: 'locked' })]),
      'fr',
      false,
      '✅',
    );
    const description = view.embeds[0]?.toJSON().description ?? '';
    expect(description).toContain('✅ **G2** vs **FNC** → **G2**');
    expect(description).toContain('▫️ **G2** vs **FNC** → **—**');
    expect(description).toContain('🔒');
    expect(decodePrediction(buttonsOf(view)[0]?.custom_id ?? '')).toEqual({
      action: 'go',
      publicationId: 7,
      index: 1,
    });
  });
});
