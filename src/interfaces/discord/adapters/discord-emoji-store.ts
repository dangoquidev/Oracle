import { GuildPremiumTier, type Client, type Guild, type GuildEmoji } from 'discord.js';
import type { TeamEmojiStore } from '../../../application/ports/team-emoji-store.js';
import type { GuildId } from '../../../domain/shared/ids.js';

const STATIC_EMOJI_SLOTS: Record<GuildPremiumTier, number> = {
  [GuildPremiumTier.None]: 50,
  [GuildPremiumTier.Tier1]: 100,
  [GuildPremiumTier.Tier2]: 150,
  [GuildPremiumTier.Tier3]: 250,
};
/** Discord rejects emoji images above 256 KiB. */
const MAX_EMOJI_BYTES = 256 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;

interface Host {
  readonly guild: Guild;
  readonly emojis: readonly GuildEmoji[];
}

/**
 * Stores team logos as custom emojis on dedicated "emoji host" servers.
 * Bots can use emojis of any server they are in, so logos render everywhere.
 * An emoji already named after the team (e.g. added by hand) is reused as is.
 */
export class DiscordEmojiStore implements TeamEmojiStore {
  constructor(
    private readonly client: Client,
    private readonly hostGuildIds: readonly GuildId[],
    private readonly userAgent: string,
    private readonly fetchImage: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async create(name: string, imageUrl: string): Promise<string> {
    const hosts = await this.hosts();
    const existing = hosts.flatMap((host) => host.emojis).find((emoji) => emoji.name === name);
    if (existing) return existing.id;

    const host = hosts.find(
      ({ guild, emojis }) =>
        emojis.filter((emoji) => !emoji.animated).length < STATIC_EMOJI_SLOTS[guild.premiumTier],
    );
    if (!host) throw new Error('Every emoji host server is full; add another one to EMOJI_GUILD_IDS');

    const image = await this.download(imageUrl);
    const emoji = await host.guild.emojis.create({ attachment: image, name, reason: 'Oracle team logo' });
    return emoji.id;
  }

  private async hosts(): Promise<Host[]> {
    const hosts: Host[] = [];
    for (const guildId of this.hostGuildIds) {
      const guild = await this.client.guilds.fetch(guildId);
      hosts.push({ guild, emojis: [...(await guild.emojis.fetch()).values()] });
    }
    return hosts;
  }

  /**
   * Downloads the logo ourselves so that anything but a small image (an error page, a bot check)
   * fails here with a clear reason instead of being sent to Discord.
   */
  private async download(url: string): Promise<Buffer> {
    const response = await this.fetchImage(url, {
      headers: { 'user-agent': this.userAgent },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Logo download failed (HTTP ${response.status})`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) {
      throw new Error(`Logo host did not return an image (got ${type || 'no content type'})`);
    }
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length > MAX_EMOJI_BYTES)
      throw new Error(`Logo too large for an emoji (${image.length} bytes)`);
    return image;
  }
}
