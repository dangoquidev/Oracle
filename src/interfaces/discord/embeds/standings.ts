import { userMention } from 'discord.js';
import type { LeaderboardEntry } from '../../../domain/leaderboard/leaderboard.js';
import type { Messages } from '../i18n/index.js';

const MEDALS: Readonly<Record<number, string>> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** "🥇 @player — **12 pts** · ✅ 8/10 · 🎯 2" (mentions inside embeds never ping). */
export function standingLine(entry: LeaderboardEntry, t: Messages): string {
  const rank = MEDALS[entry.rank] ?? `**${entry.rank}.**`;
  const parts = [
    `**${t.standings.points(entry.points)}**`,
    t.standings.correct(entry.correctWinners, entry.predictions),
    ...(entry.exactScores > 0 ? [t.standings.exact(entry.exactScores)] : []),
  ];
  return `${rank} ${userMention(entry.userId)} — ${parts.join(' · ')}`;
}

export function standingLines(entries: readonly LeaderboardEntry[], t: Messages): string {
  return entries.map((entry) => standingLine(entry, t)).join('\n');
}
