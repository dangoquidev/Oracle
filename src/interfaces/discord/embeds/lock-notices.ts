import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  roleMention,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { LockReminder, VoteReveal } from '../../../application/ports/guild-messenger.js';
import { encodePrediction } from '../components/custom-id.js';
import { BRAND_COLOR, WARNING_COLOR, type MessageView } from '../components/payload.js';
import { messages } from '../i18n/index.js';
import { matchup, relative, shortTime, truncate } from './formatting.js';
import { voteLine } from './vote-lines.js';

export function renderLockReminder(reminder: LockReminder, useEmojis: boolean): MessageView {
  const t = messages(reminder.locale);
  const lines = reminder.matches.map(
    (match) => `${shortTime(match.scheduledAt)} · ${matchup(match, t, useEmojis)}`,
  );
  const button = new ButtonBuilder()
    .setCustomId(encodePrediction({ action: 'open', publicationId: reminder.publicationId }))
    .setLabel(t.announcement.predictButton)
    .setEmoji('🔮')
    .setStyle(ButtonStyle.Primary);
  return {
    content: t.reminder.content(roleMention(reminder.pingRoleId), relative(reminder.lockAt)),
    embeds: [
      new EmbedBuilder()
        .setColor(WARNING_COLOR)
        .setTitle(t.reminder.title(reminder.competitionName, reminder.weekName))
        .setDescription(truncate(lines.join('\n'), 4096)),
    ],
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button)],
  };
}

export function renderVoteReveal(reveal: VoteReveal, useEmojis: boolean): MessageView {
  const t = messages(reveal.locale);
  const blocks = reveal.matches.map(
    ({ match, distribution }) => `${matchup(match, t, useEmojis)}\n${voteLine(match, distribution, t)}`,
  );
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(t.reveal.title(reveal.competitionName, reveal.weekName))
        .setDescription(truncate([t.reveal.description, ...blocks].join('\n\n'), 4096)),
    ],
    components: [],
  };
}
