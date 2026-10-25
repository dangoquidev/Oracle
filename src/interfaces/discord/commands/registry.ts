import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import { adminCommand } from './admin-command.js';
import { configureCommand } from './configure-command.js';
import { matchesCommand } from './matches-command.js';

export function commandDefinitions(
  competitions: readonly Competition[],
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [configureCommand.toJSON(), matchesCommand(competitions).toJSON(), adminCommand().toJSON()];
}
