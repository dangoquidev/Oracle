import { EmbedBuilder, userMention } from 'discord.js';
import type { PlayerStatsReport } from '../../../application/use-cases/get-player-stats.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import { percentage, type PickRecord } from '../../../domain/stats/player-stats.js';
import { BRAND_COLOR, WARNING_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import { teamLabel, truncate } from './formatting.js';

/** /stats: one player's record, rankings, streaks and habits. */
export function renderPlayerStats(
  report: PlayerStatsReport,
  displayName: string,
  locale: Locale,
  useEmojis: boolean,
): MessageView {
  const t = messages(locale);
  const embed = new EmbedBuilder()
    .setColor(report.banned ? WARNING_COLOR : BRAND_COLOR)
    .setTitle(truncate(t.stats.title(displayName), 256));
  const intro = [userMention(report.userId), ...(report.banned ? [t.stats.banned] : [])];

  if (report.record.predictions === 0) {
    embed.setDescription([...intro, '', t.stats.empty].join('\n'));
    return { embeds: [embed], components: [] };
  }

  embed.setDescription(intro.join('\n'));
  const rankings = [
    ...(report.allTime
      ? [
          `${t.stats.allTime} · ${t.stats.rank(report.allTime.rank, report.allTime.players)} · ${t.standings.points(report.allTime.points)}`,
        ]
      : []),
    ...report.seasons.map(
      (season) =>
        `${season.name} · ${t.stats.rank(season.rank, season.players)} · ${t.standings.points(season.points)}`,
    ),
  ];
  if (rankings.length > 0) embed.addFields({ name: t.stats.ranking, value: rankings.join('\n') });

  embed.addFields(
    { name: t.stats.predictions, value: recordLines(report.record, t).join('\n') },
    { name: t.stats.streaks, value: t.stats.streakLine(report.currentStreak, report.bestStreak) },
  );
  if (report.bestWeek) {
    const { competitionName, weekName, points } = report.bestWeek;
    embed.addFields({
      name: t.stats.bestWeek,
      value: `${competitionName} · ${weekName} — **${t.standings.points(points)}**`,
      inline: true,
    });
  }
  if (report.favouriteTeam) {
    const { team, picks, correct } = report.favouriteTeam;
    embed.addFields({
      name: t.stats.favouriteTeam,
      value: t.stats.favouriteLine(teamLabel(team, t, useEmojis), picks, percentage(correct, picks)),
      inline: true,
    });
  }
  if (report.competitions.length > 1) {
    embed.addFields({
      name: t.stats.byCompetition,
      value: report.competitions
        .map(
          (record) =>
            `**${record.name}** — ${t.standings.points(record.points)} · ${t.standings.correct(record.correctWinners, record.predictions)}` +
            (record.exactScores > 0 ? ` · ${t.standings.exact(record.exactScores)}` : ''),
        )
        .join('\n'),
    });
  }
  return { embeds: [embed], components: [] };
}

function recordLines(record: PickRecord, t: Messages): string[] {
  return [
    `**${t.standings.points(record.points)}** · ${t.stats.judged(record.predictions)}`,
    t.stats.winners(
      record.correctWinners,
      record.predictions,
      percentage(record.correctWinners, record.predictions),
    ),
    ...(record.seriesPredictions > 0
      ? [
          t.stats.exact(
            record.exactScores,
            record.seriesPredictions,
            percentage(record.exactScores, record.seriesPredictions),
          ),
        ]
      : []),
  ];
}
