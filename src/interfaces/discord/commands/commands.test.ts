import { describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../../config/competitions.js';
import { commandDefinitions } from './registry.js';

describe('command definitions', () => {
  const commands = commandDefinitions(COMPETITIONS);
  const byName = new Map(commands.map((command) => [command.name, command]));

  it('registers /configure, /matches and /admin', () => {
    expect([...byName.keys()]).toEqual(['configure', 'matches', 'admin']);
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

  it('offers open and close subcommands with autocompleted targets', () => {
    const subcommands = (byName.get('admin')?.options ?? []) as {
      name: string;
      options?: { name: string; autocomplete?: boolean }[];
    }[];
    expect(subcommands.map((sub) => sub.name)).toEqual(['open', 'close']);
    expect(subcommands[0]?.options?.map((option) => [option.name, option.autocomplete])).toEqual([
      ['week', true],
      ['match', true],
    ]);
  });
});
