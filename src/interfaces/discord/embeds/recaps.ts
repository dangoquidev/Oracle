import { EmbedBuilder, userMention } from 'discord.js';
import type { MatchRecap, RecapMatchLine, SeasonRecap } from '../../../application/ports/guild-messenger.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import { dayHeading, matchup, outcomeLabel, truncate } from './formatting.js';
import { standingLines } from './standings.js';

const FIELD_MAX = 1024;

export function renderMatchRecap(recap: MatchRecap, useEmojis: boolean): MessageView {
  const t = messages(recap.locale);
  const title =
    recap.kind === 'day'
      ? t.recap.dayTitle(recap.competitionName, dayHeading(recap.startsAt, recap.timeZone, recap.locale))
      : t.recap.weekTitle(recap.competitionName, recap.weekName);
  const results = recap.matches.map((line) => resultLine(line, t, useEmojis));

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title)
    .setDescription(truncate([`**${t.recap.results}**`, ...results].join('\n'), 4096))
    .setFooter({ text: t.common.dataCredit });
  if (recap.standings.length > 0) {
    embed.addFields({
      name: t.recap.best[recap.kind],
      value: truncate(standingLines(recap.standings, t), FIELD_MAX),
    });
  }
  if (recap.season && recap.season.standings.length > 0) {
    embed.addFields({
      name: t.recap.season(recap.season.name),
      value: truncate(standingLines(recap.season.standings, t), FIELD_MAX),
    });
  }
  return { embeds: [embed], components: [] };
}

function resultLine(line: RecapMatchLine, t: Messages, useEmojis: boolean): string {
  const result = outcomeLabel(line.outcome, line.match, t);
  const head =
    line.outcome.kind === 'void'
      ? `🚫 ${matchup(line.match, t, useEmojis)}`
      : `🏁 ${matchup(line.match, t, useEmojis)}`;
  const parts = [head, ...(result ? [`**${result}**`] : [])];
  if (line.predictions > 0) {
    const percent = Math.round((line.correctWinners / line.predictions) * 100);
    parts.push(t.recap.correctShare(percent, line.correctWinners, line.predictions));
  }
  return parts.join(' · ');
}

export function renderSeasonRecap(recap: SeasonRecap): MessageView {
  const t = messages(recap.locale);
  const champions = recap.standings
    .filter((entry) => entry.rank === 1)
    .map((entry) => userMention(entry.userId));
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(t.recap.seasonTitle(recap.seasonName))
    .setDescription(
      truncate(
        [
          t.recap.seasonIntro,
          '',
          standingLines(recap.standings, t),
          '',
          t.recap.champion(champions.join(', ')),
        ].join('\n'),
        4096,
      ),
    )
    .setFooter({ text: `${t.standings.players(recap.players)} · ${t.leaderboard.legend}` });
  return { embeds: [embed], components: [] };
}
