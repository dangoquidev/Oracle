import { EmbedBuilder } from 'discord.js';
import type { Leaderboard } from '../../../application/use-cases/get-leaderboard.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import { truncate } from './formatting.js';
import { standingLine, standingLines } from './standings.js';

const SHOWN = 20;

export function renderLeaderboard(board: Leaderboard, locale: Locale): MessageView {
  const t = messages(locale);
  const shown = board.entries.slice(0, SHOWN);
  // Players outside the top still see where they stand.
  const viewerLine =
    board.viewer && !shown.includes(board.viewer) ? ['…', standingLine(board.viewer, t)] : [];
  const body =
    board.period !== 'alltime' && board.scopes.length === 0
      ? t.leaderboard.nothingStarted
      : shown.length === 0
        ? t.leaderboard.empty
        : [standingLines(shown, t), ...viewerLine].join('\n');

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(t.leaderboard.title[board.period])
    .setDescription(truncate(`-# ${scopeLine(board, t)}\n\n${body}`, 4096));
  if (board.entries.length > 0) {
    embed.setFooter({ text: `${t.standings.players(board.entries.length)} · ${t.leaderboard.legend}` });
  }
  return { embeds: [embed], components: [] };
}

function scopeLine(board: Leaderboard, t: Messages): string {
  if (board.scopes.length === 0) return t.leaderboard.allCompetitions;
  return board.scopes
    .map(({ competitionName, label }) => {
      // Season names already carry the competition ("LEC 2026 Summer").
      if (label === null) return competitionName;
      return board.period === 'season' ? label : `${competitionName} · ${label}`;
    })
    .join(' — ');
}
