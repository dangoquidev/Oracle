import type {
  ActionRowBuilder,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  MessageCreateOptions,
} from 'discord.js';

/** A rendered message, usable to send, reply or update. */
export interface MessageView {
  readonly content?: string;
  readonly embeds: EmbedBuilder[];
  readonly components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

/** Options to post a view as a new message. */
export function toCreateOptions(view: MessageView): MessageCreateOptions {
  return {
    ...(view.content ? { content: view.content } : {}),
    embeds: view.embeds,
    components: view.components,
  };
}

export const BRAND_COLOR = 0x0ac8b9;
export const WARNING_COLOR = 0xf0b232;
