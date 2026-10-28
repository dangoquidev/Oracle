import { EmbedBuilder, userMention } from 'discord.js';
import type { SharedPredictions } from '../../../application/ports/guild-messenger.js';
import type { JudgedPrediction } from '../../../application/ports/prediction-repository.js';
import type {
  RoundPredictionItem,
  RoundPredictions,
} from '../../../application/use-cases/get-round-predictions.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import { sameChoice } from '../../../domain/prediction/prediction-choice.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import { choiceLabel, dayHeading, localDayKey, matchup, shortTime, truncate } from './formatting.js';
import { matchStateLabel } from './week-matches.js';

const MAX_EMBEDS = 10;
const MAX_DESCRIPTION = 4096;

/** /prono: every player's pick on each match of the current round, grouped by pick. */
export function renderRoundPredictions(
  result: RoundPredictions,
  locale: Locale,
  useEmojis: boolean,
): MessageView {
  const t = messages(locale);
  if (result.weeks.length === 0) return { content: t.matches.empty, embeds: [], components: [] };

  const embeds = result.weeks.slice(0, MAX_EMBEDS).map(({ week, items, players }) => {
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
        `${shortTime(item.match.scheduledAt)} · ${matchup(item.match, t, useEmojis)} · ${t.announcement.format(item.match.bestOf)}`,
        `-# ${matchStateLabel(item, t)}`,
        ...pickLines(item, t),
      );
    }
    return new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(t.roundPredictions.title(week.competitionName, week.week.name))
      .setDescription(truncate(lines.length > 0 ? lines.join('\n') : t.announcement.empty, MAX_DESCRIPTION))
      .setFooter({ text: `${t.standings.players(players)} · ${t.common.dataCredit}` });
  });
  return { embeds, components: [] };
}

/** Players grouped by pick, most popular first; ✅ marks the picks that earned points. */
function pickLines(item: RoundPredictionItem, t: Messages): string[] {
  if (item.picks.length === 0) return [`↳ *${t.roundPredictions.none}*`];
  const groups: JudgedPrediction[][] = [];
  for (const pick of item.picks) {
    const group = groups.find(([first]) => first !== undefined && sameChoice(first.choice, pick.choice));
    if (group) group.push(pick);
    else groups.push([pick]);
  }
  return groups
    .toSorted((a, b) => b.length - a.length)
    .map((group) => {
      const [first] = group;
      if (!first) return '';
      const scored = first.outcome.status === 'scored' ? first.outcome : null;
      const mark = scored ? (scored.exactScore ? '🎯 ' : scored.correctWinner ? '✅ ' : '❌ ') : '';
      const players = group.map((pick) => userMention(pick.userId)).join(', ');
      return `↳ ${mark}**${choiceLabel(first.choice, item.match, t)}** (${group.length}) : ${players}`;
    });
}

/** The picks a player just finished, posted in the channel. */
export function renderSharedPredictions(shared: SharedPredictions, useEmojis: boolean): MessageView {
  const t = messages(shared.locale);
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(t.roundPredictions.sharedTitle)
    .setDescription(t.roundPredictions.sharedIntro(userMention(shared.userId)))
    .addFields(
      shared.groups.slice(0, 25).map((group) => ({
        name: truncate(`${group.competitionName} · ${group.weekName}`, 256),
        value: truncate(
          group.picks
            .map(
              ({ match, choice }) => `${matchup(match, t, useEmojis)} → **${choiceLabel(choice, match, t)}**`,
            )
            .join('\n'),
          1024,
        ),
      })),
    );
  return { embeds: [embed], components: [] };
}
