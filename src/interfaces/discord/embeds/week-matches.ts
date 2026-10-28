import { EmbedBuilder } from 'discord.js';
import type { WeekMatchesItem, WeekMatchesResult } from '../../../application/use-cases/list-week-matches.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import {
  dayHeading,
  localDayKey,
  matchup,
  outcomeLabel,
  relative,
  shortTime,
  truncate,
} from './formatting.js';
import { voteLine } from './vote-lines.js';

export function renderWeekMatches(
  result: WeekMatchesResult,
  locale: Locale,
  useEmojis: boolean,
): MessageView {
  const t = messages(locale);
  if (result.weeks.length === 0) return { content: t.matches.empty, embeds: [], components: [] };

  const embeds = result.weeks.slice(0, 10).map(({ week, items }) => {
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
        `-# ${stateLine(item, t)}`,
      );
    }
    return new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(t.matches.title(week.competitionName, week.week.name))
      .setDescription(truncate(lines.length > 0 ? lines.join('\n') : t.announcement.empty, 4096))
      .setFooter({ text: t.common.dataCredit });
  });
  return { embeds, components: [] };
}

function stateLine(item: WeekMatchesItem, t: Messages): string {
  const state = matchStateLabel(item, t);
  return item.distribution && item.distribution.total > 0
    ? `${state} · ${voteLine(item.match, item.distribution, t)}`
    : state;
}

/** "🟢 votes open, closing in 2 h", "🏁 over · **G2 2-1 FNC**"… */
export function matchStateLabel(item: WeekMatchesItem, t: Messages): string {
  if (item.state === 'open') return t.matches.state.open(relative(item.lockAt));
  const result = item.state === 'closed' ? outcomeLabel(item.outcome, item.match, t) : null;
  return result ? `${t.matches.state.closed} · **${result}**` : t.matches.state[item.state];
}
