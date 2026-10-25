import { EmbedBuilder } from 'discord.js';
import type { Locale } from '../../../domain/guild/guild-settings.js';
import type { PauseReason } from '../../../domain/guild/guild.js';
import { BRAND_COLOR, WARNING_COLOR, type MessageView } from '../components/payload.js';
import { messages } from '../i18n/index.js';

/** Sent before any language is chosen, hence in both languages. */
export function renderWelcome(): MessageView {
  const fr = messages('fr').welcome;
  const en = messages('en').welcome;
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(`${fr.title} / ${en.title}`)
        .setDescription(`🇫🇷 ${fr.body}\n**${fr.action}**\n\n🇬🇧 ${en.body}\n**${en.action}**`),
    ],
    components: [],
  };
}

export function renderPauseNotice(reason: PauseReason, locale: Locale): MessageView {
  const t = messages(locale).pause;
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(WARNING_COLOR)
        .setTitle(`⏸️ ${t.title}`)
        .setDescription(`${t[reason]}\n**${t.action}**`),
    ],
    components: [],
  };
}
