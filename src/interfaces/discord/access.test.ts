import { PermissionFlagsBits, PermissionsBitField, type RepliableInteraction } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { canAdminister, isOperator } from './access.js';
import type { DiscordDependencies } from './dependencies.js';

const interaction = (userId: string, manageGuild: boolean) =>
  ({
    user: { id: userId },
    memberPermissions: new PermissionsBitField(manageGuild ? PermissionFlagsBits.ManageGuild : 0n),
  }) as unknown as RepliableInteraction<'cached'>;
const deps = (operatorId: string | null) => ({ operatorId }) as DiscordDependencies;

describe('access', () => {
  it('recognises the operator configured with ADMIN_ID', () => {
    expect(isOperator(interaction('42', false), deps('42'))).toBe(true);
    expect(isOperator(interaction('7', true), deps('42'))).toBe(false);
    expect(isOperator(interaction('42', false), deps(null))).toBe(false);
  });

  it('lets server managers and the operator administer', () => {
    expect(canAdminister(interaction('7', true), deps('42'))).toBe(true);
    expect(canAdminister(interaction('42', false), deps('42'))).toBe(true);
    expect(canAdminister(interaction('7', false), deps('42'))).toBe(false);
    expect(canAdminister(interaction('7', false), deps(null))).toBe(false);
  });
});
