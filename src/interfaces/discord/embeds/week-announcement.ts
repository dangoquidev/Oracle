import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  roleMention,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { WeekAnnouncement } from '../../../application/ports/guild-messenger.js';
import type { WeekView } from '../../../application/read-models/views.js';
import { encodePrediction } from '../components/custom-id.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import { dayHeading, localDayKey, matchup, shortTime, truncate } from './formatting.js';

const MAX_EMBEDS = 10;
const MAX_DESCRIPTION = 4096;

export function renderWeekAnnouncement(announcement: WeekAnnouncement, useEmojis: boolean): MessageView {
  const t = messages(announcement.locale);
  const embeds = announcement.weeks
    .slice(0, MAX_EMBEDS)
    .map((week) => weekEmbed(week, announcement, t, useEmojis));

  const button = new ButtonBuilder()
    .setCustomId(encodePrediction({ action: 'open', publicationId: announcement.publicationId }))
    .setLabel(t.announcement.predictButton)
    .setEmoji('🔮')
    .setStyle(ButtonStyle.Primary);

  const role = roleMention(announcement.pingRoleId);
  return {
    content: announcement.scope === 'day' ? t.announcement.dayContent(role) : t.announcement.content(role),
    embeds,
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button)],
  };
}

function weekEmbed(
  week: WeekView,
  announcement: WeekAnnouncement,
  t: Messages,
  useEmojis: boolean,
): EmbedBuilder {
  const { timeZone, locale } = announcement;
  // A week lists its matches under day headings; a single day puts its date in the title instead.
  const groupByDay = announcement.scope === 'week';
  const title = [week.competitionName, week.week.name];
  const first = week.matches[0];
  if (!groupByDay && first) title.push(dayHeading(first.scheduledAt, timeZone, locale));

  const lines: string[] = [];
  let currentDay: string | null = null;
  for (const match of week.matches) {
    const day = localDayKey(match.scheduledAt, timeZone);
    if (groupByDay && day !== currentDay) {
      if (currentDay !== null) lines.push('');
      lines.push(`**${dayHeading(match.scheduledAt, timeZone, locale)}**`);
      currentDay = day;
    }
    lines.push(
      `${shortTime(match.scheduledAt)} · ${matchup(match, t, useEmojis)} · ${t.announcement.format(match.bestOf)}`,
    );
  }

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title.join(' · '))
    .setDescription(truncate(lines.length > 0 ? lines.join('\n') : t.announcement.empty, MAX_DESCRIPTION))
    .setFooter({ text: t.common.dataCredit });
}
