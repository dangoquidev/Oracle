import { time, TimestampStyles } from 'discord.js';
import { DateTime } from 'luxon';
import type { MatchView, TeamView } from '../../../application/read-models/views.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import type { MatchResult } from '../../../domain/match/match.js';
import type { PredictionChoice } from '../../../domain/prediction/prediction-choice.js';
import type { MatchOutcome } from '../../../domain/scoring/match-outcome.js';
import type { PredictionOutcome } from '../../../domain/scoring/score-prediction.js';
import type { Messages } from '../i18n/index.js';

/** Renders a team with its logo emoji when available and allowed in the target channel. */
export function teamLabel(team: TeamView | null, t: Messages, useEmojis: boolean): string {
  if (!team) return `*${t.common.unknownTeam}*`;
  const emoji = useEmojis && team.emojiId ? `<:t:${team.emojiId}> ` : '';
  return `${emoji}**${team.shortName}**`;
}

export function matchup(match: MatchView, t: Messages, useEmojis: boolean): string {
  return `${teamLabel(match.team1, t, useEmojis)} vs ${teamLabel(match.team2, t, useEmojis)}`;
}

export function shortName(team: TeamView | null, t: Messages): string {
  return team?.shortName ?? t.common.unknownTeam;
}

/** Human label of a pick, e.g. "G2" (Bo1) or "2-1 G2" (series, winner's score first). */
export function choiceLabel(choice: PredictionChoice, match: MatchView, t: Messages): string {
  if (choice.kind === 'winner') return shortName(choice.winner === 1 ? match.team1 : match.team2, t);
  const { team1, team2 } = choice.score;
  const winner = team1 > team2 ? match.team1 : match.team2;
  return `${Math.max(team1, team2)}-${Math.min(team1, team2)} ${shortName(winner, t)}`;
}

/** "G2 2-1 FNC", or "G2 wins" when only the winner is known. */
export function resultLabel(result: MatchResult, match: MatchView, t: Messages): string {
  if (!result.score) return t.results.winner(shortName(result.winner === 1 ? match.team1 : match.team2, t));
  return `${shortName(match.team1, t)} ${result.score.team1}-${result.score.team2} ${shortName(match.team2, t)}`;
}

export function outcomeLabel(outcome: MatchOutcome, match: MatchView, t: Messages): string | null {
  if (outcome.kind === 'decided') return resultLabel(outcome.result, match, t);
  return outcome.kind === 'void' ? t.results.cancelled : null;
}

export function judgementLabel(judgement: PredictionOutcome, t: Messages): string {
  if (judgement.status === 'scored') return t.results.points(judgement.points);
  return judgement.status === 'void' ? t.results.void : t.results.pending;
}

/** Discord renders these in each viewer's own time zone. */
export const shortTime = (date: Date): string => time(date, TimestampStyles.ShortTime);
export const fullDateTime = (date: Date): string => time(date, TimestampStyles.LongDateShortTime);
export const relative = (date: Date): string => time(date, TimestampStyles.RelativeTime);

/** Day heading in the server time zone, e.g. "Vendredi 7 août". */
export function dayHeading(date: Date, timeZone: string, locale: Locale): string {
  const text = DateTime.fromJSDate(date, { zone: timeZone }).setLocale(locale).toFormat('cccc d LLLL');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function localDayKey(date: Date, timeZone: string): string {
  return DateTime.fromJSDate(date, { zone: timeZone }).toISODate() ?? date.toISOString().slice(0, 10);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
