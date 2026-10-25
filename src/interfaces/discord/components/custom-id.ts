import type { PredictionChoice } from '../../../domain/prediction/prediction-choice.js';

/**
 * Component custom ids carry all the state needed to handle a click, so flows survive restarts.
 * Format: "<scope>:<action>[:<arg>…]", at most 100 characters.
 */
export type PredictionAction =
  | { readonly action: 'open'; readonly publicationId: number }
  | { readonly action: 'go'; readonly publicationId: number; readonly index: number }
  | {
      readonly action: 'pick';
      readonly publicationId: number;
      readonly matchId: number;
      readonly choice: PredictionChoice;
    }
  | { readonly action: 'summary'; readonly publicationId: number };

export const PREDICTION_SCOPE = 'pr';
export const CONFIGURE_SCOPE = 'cfg';

export function encodePrediction(action: PredictionAction): string {
  switch (action.action) {
    case 'open':
    case 'summary':
      return `${PREDICTION_SCOPE}:${action.action}:${action.publicationId}`;
    case 'go':
      return `${PREDICTION_SCOPE}:go:${action.publicationId}:${action.index}`;
    case 'pick':
      return `${PREDICTION_SCOPE}:pick:${action.publicationId}:${action.matchId}:${encodeChoice(action.choice)}`;
  }
}

export function decodePrediction(customId: string): PredictionAction | null {
  const [scope, action, rawPublication, rawTarget, rawChoice] = customId.split(':');
  if (scope !== PREDICTION_SCOPE) return null;
  const publicationId = toId(rawPublication);
  if (publicationId === null) return null;
  if (action === 'open' || action === 'summary') return { action, publicationId };

  if (action === 'go') {
    const index = toIndex(rawTarget);
    return index === null ? null : { action, publicationId, index };
  }
  if (action === 'pick') {
    const matchId = toId(rawTarget);
    const choice = decodeChoice(rawChoice);
    return matchId !== null && choice ? { action, publicationId, matchId, choice } : null;
  }
  return null;
}

export function encodeChoice(choice: PredictionChoice): string {
  return choice.kind === 'winner' ? `w${choice.winner}` : `s${choice.score.team1}-${choice.score.team2}`;
}

export function decodeChoice(raw: string | undefined): PredictionChoice | null {
  const winner = /^w([12])$/.exec(raw ?? '');
  if (winner) return { kind: 'winner', winner: winner[1] === '1' ? 1 : 2 };
  const score = /^s(\d)-(\d)$/.exec(raw ?? '');
  if (score) return { kind: 'score', score: { team1: Number(score[1]), team2: Number(score[2]) } };
  return null;
}

/** Configure wizard ids: "cfg:<action>[:<arg>]". */
export function encodeConfigure(action: string, arg?: string): string {
  return arg === undefined ? `${CONFIGURE_SCOPE}:${action}` : `${CONFIGURE_SCOPE}:${action}:${arg}`;
}

export function decodeConfigure(customId: string): { action: string; arg: string | null } | null {
  const [scope, action, ...rest] = customId.split(':');
  if (scope !== CONFIGURE_SCOPE || !action) return null;
  return { action, arg: rest.length > 0 ? rest.join(':') : null };
}

function toId(raw: string | undefined): number | null {
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function toIndex(raw: string | undefined): number | null {
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
