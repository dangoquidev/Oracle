import {
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { MessageView } from './components/payload.js';
import { postInChannel } from './public-message.js';

const view: MessageView = { embeds: [new EmbedBuilder().setTitle('Classement')], components: [] };

function fakeInteraction(permissions: bigint) {
  const calls: string[] = [];
  const sent: unknown[] = [];
  const interaction = {
    guild: { members: { me: { id: 'bot' } } },
    channel: {
      permissionsFor: () => new PermissionsBitField(permissions),
      send: (options: unknown) => {
        calls.push('send');
        sent.push(options);
        return Promise.resolve();
      },
    },
    deferReply: (options: unknown) => {
      calls.push(`defer:${JSON.stringify(options)}`);
      return Promise.resolve();
    },
    deleteReply: () => {
      calls.push('delete');
      return Promise.resolve();
    },
    reply: (options: { allowedMentions?: unknown }) => {
      calls.push(`reply:${JSON.stringify(options.allowedMentions)}`);
      return Promise.resolve();
    },
  } as unknown as ChatInputCommandInteraction<'cached'>;
  return { interaction, calls, sent };
}

describe('postInChannel', () => {
  it('posts a bot message in the channel and clears the private placeholder', async () => {
    const all =
      PermissionsBitField.Flags.ViewChannel |
      PermissionsBitField.Flags.SendMessages |
      PermissionsBitField.Flags.EmbedLinks;
    const { interaction, calls, sent } = fakeInteraction(all);
    await postInChannel(interaction, view);
    expect(calls).toEqual([`defer:${JSON.stringify({ flags: MessageFlags.Ephemeral })}`, 'send', 'delete']);
    expect(sent[0]).toMatchObject({ embeds: view.embeds, allowedMentions: { parse: [] } });
    expect(sent[0]).not.toHaveProperty('content');
  });

  it('falls back to a public reply when the bot cannot write in the channel', async () => {
    const { interaction, calls } = fakeInteraction(PermissionsBitField.Flags.ViewChannel);
    await postInChannel(interaction, view);
    expect(calls).toEqual([`reply:${JSON.stringify({ parse: [] })}`]);
  });
});
