import { describe, expect, it } from 'vitest';
import { COMPETITIONS } from '../../../config/competitions.js';
import { commandDefinitions } from './registry.js';

describe('command definitions', () => {
  const commands = commandDefinitions(COMPETITIONS);
  const byName = new Map(commands.map((command) => [command.name, command]));

  it('registers every command', () => {
    expect([...byName.keys()]).toEqual([
      'configure',
      'config',
      'matches',
      'mypronos',
      'leaderboard',
      'stats',
      'admin',
    ]);
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
    expect(byName.get('config')?.default_member_permissions).toBe('32');
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
    expect(subcommands.map((sub) => sub.name)).toEqual([
      'open',
      'close',
      'result',
      'cancel',
      'recalc',
      'ban',
      'unban',
      'sync',
    ]);
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

  it('offers one /config subcommand per setting, with localised options', () => {
    const subcommands = (byName.get('config')?.options ?? []) as {
      name: string;
      options?: {
        name: string;
        name_localizations?: Record<string, string>;
        required?: boolean;
        autocomplete?: boolean;
        choices?: { value: string | number; name_localizations?: Record<string, string> }[];
      }[];
    }[];
    expect(subcommands.map((sub) => sub.name)).toEqual([
      'show',
      'channel',
      'role',
      'timezone',
      'language',
      'lock',
      'reminders',
      'recap',
      'publish',
      'competitions',
    ]);
    const byOption = new Map(subcommands.map((sub) => [sub.name, sub.options ?? []]));
    expect(byOption.get('timezone')?.[0]).toMatchObject({
      name: 'timezone',
      required: true,
      autocomplete: true,
    });
    const lock = byOption.get('lock') ?? [];
    expect(
      lock.map((option) => [option.name, option.name_localizations?.fr ?? null, option.required ?? false]),
    ).toEqual([
      ['mode', null, false],
      ['delay', 'delai', false],
    ]);
    expect(lock[1]?.choices?.find((choice) => choice.value === 120)?.name_localizations?.fr).toBe('2 h');
    expect(byOption.get('competitions')?.[0]?.choices?.map((choice) => choice.value)).toEqual([
      'worlds',
      'lec',
    ]);
  });

  it('asks for the player to ban or unban', () => {
    const subcommands = (byName.get('admin')?.options ?? []) as {
      name: string;
      options?: { name: string; required?: boolean; max_length?: number }[];
    }[];
    const ban = subcommands.find((sub) => sub.name === 'ban');
    expect(ban?.options?.map((option) => [option.name, option.required ?? false])).toEqual([
      ['user', true],
      ['reason', false],
    ]);
    expect(ban?.options?.[1]?.max_length).toBe(200);
    expect(subcommands.find((sub) => sub.name === 'sync')?.options ?? []).toEqual([]);
  });

  it('lets players look up someone else in /stats', () => {
    const options = (byName.get('stats')?.options ?? []) as {
      name: string;
      name_localizations?: Record<string, string>;
      required?: boolean;
    }[];
    expect(
      options.map((option) => [option.name, option.name_localizations?.fr, option.required ?? false]),
    ).toEqual([['user', 'joueur', false]]);
    expect(byName.get('stats')?.default_member_permissions).toBeUndefined();
  });
});
