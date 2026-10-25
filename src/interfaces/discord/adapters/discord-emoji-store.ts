import { GuildPremiumTier, type Client, type Guild } from 'discord.js';
import type { TeamEmojiStore } from '../../../application/ports/team-emoji-store.js';
import type { GuildId } from '../../../domain/shared/ids.js';

const STATIC_EMOJI_SLOTS: Record<GuildPremiumTier, number> = {
  [GuildPremiumTier.None]: 50,
  [GuildPremiumTier.Tier1]: 100,
  [GuildPremiumTier.Tier2]: 150,
  [GuildPremiumTier.Tier3]: 250,
};

/**
 * Stores team logos as custom emojis on dedicated "emoji host" servers.
 * Bots can use emojis of any server they are in, so logos render everywhere.
 */
export class DiscordEmojiStore implements TeamEmojiStore {
  constructor(
    private readonly client: Client,
    private readonly hostGuildIds: readonly GuildId[],
  ) {}

  async create(name: string, imageUrl: string): Promise<string> {
    const host = await this.hostWithFreeSlot();
    const emoji = await host.emojis.create({ attachment: imageUrl, name, reason: 'PronoBot team logo' });
    return emoji.id;
  }

  private async hostWithFreeSlot(): Promise<Guild> {
    for (const guildId of this.hostGuildIds) {
      const guild = await this.client.guilds.fetch(guildId);
      const emojis = await guild.emojis.fetch();
      const staticCount = emojis.filter((emoji) => !emoji.animated).size;
      if (staticCount < STATIC_EMOJI_SLOTS[guild.premiumTier]) return guild;
    }
    throw new Error('Every emoji host server is full; add another one to EMOJI_GUILD_IDS');
  }
}
