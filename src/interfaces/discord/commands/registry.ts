import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { Competition } from '../../../domain/competition/competition.js';
import { adminCommand } from './admin-command.js';
import { configCommand } from './config-command.js';
import { configureCommand } from './configure-command.js';
import { leaderboardCommand } from './leaderboard-command.js';
import { matchesCommand } from './matches-command.js';
import { myPredictionsCommand } from './mypronos-command.js';
import { pronoCommand } from './prono-command.js';
import { statsCommand } from './stats-command.js';

export function commandDefinitions(
  competitions: readonly Competition[],
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [
    configureCommand.toJSON(),
    configCommand(competitions).toJSON(),
    matchesCommand(competitions).toJSON(),
    myPredictionsCommand(competitions).toJSON(),
    pronoCommand(competitions).toJSON(),
    leaderboardCommand(competitions).toJSON(),
    statsCommand().toJSON(),
    adminCommand().toJSON(),
  ];
}
