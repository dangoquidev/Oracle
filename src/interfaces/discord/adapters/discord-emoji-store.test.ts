import { GuildPremiumTier, type Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { DiscordEmojiStore } from './discord-emoji-store.js';

interface FakeEmoji {
  id: string;
  name: string;
  animated: boolean;
}

function fakeClient(existing: FakeEmoji[] = [], tier = GuildPremiumTier.None) {
  const created: { name: string; attachment: Buffer }[] = [];
  const guild = {
    premiumTier: tier,
    emojis: {
      fetch: () => Promise.resolve(new Map(existing.map((emoji) => [emoji.id, emoji]))),
      create: (options: { name: string; attachment: Buffer }) => {
        created.push(options);
        return Promise.resolve({ id: `new-${options.name}` });
      },
    },
  };
  const client = { guilds: { fetch: () => Promise.resolve(guild) } } as unknown as Client;
  return { client, created };
}

const respond =
  (body: string | Uint8Array, contentType: string, status = 200) =>
  () =>
    Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } }));

describe('DiscordEmojiStore', () => {
  it('downloads the logo with its own user agent and uploads it', async () => {
    const { client, created } = fakeClient();
    const requests: RequestInit[] = [];
    const store = new DiscordEmojiStore(client, ['host'], 'Oracle/1.0 (contact)', (_url, init) => {
      requests.push(init ?? {});
      return respond(new Uint8Array([137, 80, 78, 71]), 'image/png')();
    });
    expect(await store.create('G2', 'https://logo/g2.png')).toBe('new-G2');
    expect(created[0]?.attachment).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(new Headers(requests[0]?.headers).get('user-agent')).toBe('Oracle/1.0 (contact)');
  });

  it('reuses an emoji already named after the team, without downloading', async () => {
    const { client, created } = fakeClient([{ id: 'manual', name: 'LYON', animated: false }]);
    const store = new DiscordEmojiStore(client, ['host'], 'ua', () =>
      Promise.reject(new Error('no network')),
    );
    expect(await store.create('LYON', 'https://logo/lyon.png')).toBe('manual');
    expect(created).toEqual([]);
  });

  it('refuses anything that is not a small image, such as a bot check page', async () => {
    const { client, created } = fakeClient();
    const store = (fetchImage: typeof fetch) => new DiscordEmojiStore(client, ['host'], 'ua', fetchImage);
    await expect(
      store(respond('<html>Just a moment...</html>', 'text/html; charset=UTF-8', 403)).create('KC', 'u'),
    ).rejects.toThrow('Logo download failed (HTTP 403)');
    await expect(
      store(respond('<html>Just a moment...</html>', 'text/html')).create('KC', 'u'),
    ).rejects.toThrow('Logo host did not return an image (got text/html)');
    await expect(store(respond(new Uint8Array(300 * 1024), 'image/png')).create('KC', 'u')).rejects.toThrow(
      'Logo too large for an emoji (307200 bytes)',
    );
    expect(created).toEqual([]);
  });

  it('reports full emoji servers', async () => {
    const full = Array.from({ length: 50 }, (_, index) => ({
      id: `${index}`,
      name: `e${index}`,
      animated: false,
    }));
    const { client } = fakeClient(full);
    const store = new DiscordEmojiStore(client, ['host'], 'ua', respond(new Uint8Array([1]), 'image/png'));
    await expect(store.create('T1', 'u')).rejects.toThrow('Every emoji host server is full');
  });
});
