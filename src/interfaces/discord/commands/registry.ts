import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { configureCommand } from './configure-command.js';

export function commandDefinitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [configureCommand.toJSON()];
}
