import { Events, type Client } from 'discord.js';
import type { DiscordDependencies } from './dependencies.js';

/** Server lifecycle events, delegated to use cases. Failures are logged, never thrown. */
export function registerGuildEvents(client: Client, deps: DiscordDependencies): void {
  const { logger, useCases, emojiHostGuildIds } = deps;
  const run = (event: string, guildId: string, task: () => Promise<void>) => {
    if (emojiHostGuildIds.has(guildId)) return;
    task().catch((error: unknown) => {
      logger.error({ event, guildId, err: error }, 'Guild event handling failed');
    });
  };

  client.on(Events.GuildCreate, (guild) => {
    run('guildCreate', guild.id, () => useCases.registerGuild.execute(guild.id));
  });
  client.on(Events.GuildDelete, (guild) => {
    // An unavailable guild is a Discord outage, not a removal.
    if (!guild.available) return;
    run('guildDelete', guild.id, () => useCases.leaveGuild.execute(guild.id));
  });
  client.on(Events.GuildRoleDelete, (role) => {
    run('roleDelete', role.guild.id, () =>
      useCases.handleResourceDeleted.execute(role.guild.id, { roleId: role.id }),
    );
  });
  client.on(Events.ChannelDelete, (channel) => {
    if (channel.isDMBased()) return;
    run('channelDelete', channel.guildId, () =>
      useCases.handleResourceDeleted.execute(channel.guildId, { channelId: channel.id }),
    );
  });
}

/** Catches up with servers joined, left or changed while the bot was offline. */
export async function reconcileOnReady(client: Client<true>, deps: DiscordDependencies): Promise<void> {
  const guildIds = client.guilds.cache
    .map((guild) => guild.id)
    .filter((id) => !deps.emojiHostGuildIds.has(id));
  await deps.useCases.reconcileGuilds.execute(guildIds);
}
