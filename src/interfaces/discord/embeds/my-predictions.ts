import { EmbedBuilder } from 'discord.js';
import type { MyPredictionItem, MyPredictions } from '../../../application/use-cases/get-my-predictions.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import {
  choiceLabel,
  dayHeading,
  judgementLabel,
  localDayKey,
  matchup,
  outcomeLabel,
  relative,
  shortTime,
  truncate,
} from './formatting.js';

export function renderMyPredictions(result: MyPredictions, locale: Locale, useEmojis: boolean): MessageView {
  const t = messages(locale);
  if (result.weeks.length === 0) return { content: t.myPredictions.empty, embeds: [], components: [] };

  const embeds = result.weeks.slice(0, 10).map(({ week, items, totals }) => {
    const lines: string[] = [];
    let currentDay: string | null = null;
    for (const item of items) {
      const day = localDayKey(item.match.scheduledAt, result.timeZone);
      if (day !== currentDay) {
        if (currentDay !== null) lines.push('');
        lines.push(`**${dayHeading(item.match.scheduledAt, result.timeZone, locale)}**`);
        currentDay = day;
      }
      lines.push(
        `${statusIcon(item)} ${shortTime(item.match.scheduledAt)} · ${matchup(item.match, t, useEmojis)}`,
        `-# ${detailLine(item, t)}`,
      );
    }
    const embed = new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(t.myPredictions.title(week.competitionName, week.week.name))
      .setDescription(truncate(lines.length > 0 ? lines.join('\n') : t.announcement.empty, 4096));
    if (totals.picked > 0) {
      const breakdown = [
        t.standings.correct(totals.correctWinners, totals.judged),
        ...(totals.exactScores > 0 ? [t.standings.exact(totals.exactScores)] : []),
      ];
      embed.addFields({
        name: t.myPredictions.total,
        value: [t.myPredictions.totals(t.standings.points(totals.points), totals.picked), ...breakdown].join(
          ' · ',
        ),
      });
    }
    return embed;
  });
  return { embeds, components: [] };
}

function statusIcon(item: MyPredictionItem): string {
  if (item.state === 'cancelled') return '🚫';
  const judgement = item.prediction?.outcome;
  if (judgement?.status === 'scored') return judgement.correctWinner ? '✅' : '❌';
  if (item.state === 'open') return item.prediction ? '📝' : '▫️';
  return item.prediction ? '🔒' : '➖';
}

function detailLine(item: MyPredictionItem, t: Messages): string {
  const { prediction } = item;
  if (item.state === 'cancelled') return t.matches.state.cancelled;
  if (item.state === 'open' && !prediction) return t.myPredictions.noPickYet(relative(item.lockAt));
  if (item.state === 'awaiting-opponents') return t.matches.state['awaiting-opponents'];

  const parts = [
    prediction ? t.myPredictions.pick(choiceLabel(prediction.choice, item.match, t)) : t.myPredictions.noPick,
  ];
  if (item.state === 'open') parts.push(t.myPredictions.editable(relative(item.lockAt)));
  const result = item.state === 'closed' ? outcomeLabel(item.outcome, item.match, t) : null;
  if (result) parts.push(`🏁 **${result}**`);
  else if (item.state === 'locked') parts.push(t.matches.state.locked);
  if (prediction && prediction.outcome.status !== 'pending')
    parts.push(judgementLabel(prediction.outcome, t));
  return parts.join(' · ');
}
