import { describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../../config/competitions.js';
import { commandDefinitions } from './registry.js';

describe('command definitions', () => {
  const commands = commandDefinitions(COMPETITIONS);
  const byName = new Map(commands.map((command) => [command.name, command]));

  it('registers every command', () => {
    expect([...byName.keys()]).toEqual(['configure', 'matches', 'mypronos', 'leaderboard', 'admin']);
  });

  it('lets players pick a period, a competition and a past season for the leaderboard', () => {
    const options = (byName.get('leaderboard')?.options ?? []) as {
      name: string;
      name_localizations?: Record<string, string>;
      autocomplete?: boolean;
      choices?: { value: string }[];
    }[];
    expect(options.map((option) => [option.name, option.name_localizations?.fr ?? null])).toEqual([
      ['period', 'periode'],
      ['competition', null],
      ['season', 'saison'],
    ]);
    expect(options[0]?.choices?.map((choice) => choice.value)).toEqual(['week', 'season', 'alltime']);
    expect(options[2]?.autocomplete).toBe(true);
    expect(byName.get('mypronos')?.options?.map((option) => option.name)).toEqual(['week', 'competition']);
  });

  it('restricts admin commands to "Manage Server"', () => {
    expect(byName.get('configure')?.default_member_permissions).toBe('32');
    expect(byName.get('admin')?.default_member_permissions).toBe('32');
    expect(byName.get('matches')?.default_member_permissions).toBeUndefined();
  });

  it('localises option names and offers every competition', () => {
    const options = byName.get('matches')?.options ?? [];
    expect(options.map((option) => [option.name, option.name_localizations?.fr ?? null])).toEqual([
      ['week', 'semaine'],
      ['competition', null],
    ]);
    const competition = options[1] as { choices?: { value: string }[] };
    expect(competition.choices?.map((choice) => choice.value)).toEqual(['worlds', 'lec']);
  });

  it('offers admin subcommands with autocompleted targets', () => {
    const subcommands = (byName.get('admin')?.options ?? []) as {
      name: string;
      options?: { name: string; autocomplete?: boolean; required?: boolean }[];
    }[];
    expect(subcommands.map((sub) => sub.name)).toEqual(['open', 'close', 'result', 'cancel', 'recalc']);
    expect(
      subcommands[2]?.options?.map((option) => [option.name, option.required, option.autocomplete]),
    ).toEqual([
      ['match', true, true],
      ['score', true, true],
    ]);
    expect(subcommands[0]?.options?.map((option) => [option.name, option.autocomplete])).toEqual([
      ['week', true],
      ['match', true],
    ]);
  });
});
