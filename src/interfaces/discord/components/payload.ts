import type { ActionRowBuilder, EmbedBuilder, MessageActionRowComponentBuilder } from 'discord.js';

/** A rendered message, usable to send, reply or update. */
export interface MessageView {
  readonly content?: string;
  readonly embeds: EmbedBuilder[];
  readonly components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export const BRAND_COLOR = 0x0ac8b9;
export const WARNING_COLOR = 0xf0b232;
