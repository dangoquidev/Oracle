import { PermissionFlagsBits, type RepliableInteraction } from 'discord.js';
import type { DiscordDependencies } from './dependencies.js';

/** The bot operator (ADMIN_ID), allowed everywhere. */
export function isOperator(interaction: RepliableInteraction<'cached'>, deps: DiscordDependencies): boolean {
  return deps.operatorId !== null && interaction.user.id === deps.operatorId;
}

/** Members with "Manage Server", and the bot operator on any server. */
export function canAdminister(
  interaction: RepliableInteraction<'cached'>,
  deps: DiscordDependencies,
): boolean {
  return isOperator(interaction, deps) || interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
}
