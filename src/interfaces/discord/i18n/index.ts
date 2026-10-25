import type { Locale } from '../../../domain/guild/guild-settings.js';
import { en } from './en.js';
import { fr, type Messages } from './fr.js';

export type { Messages };

const catalogs: Record<Locale, Messages> = { fr, en };

export function messages(locale: Locale): Messages {
  return catalogs[locale];
}

/** Maps a Discord locale ("fr", "en-US", "en-GB"…) to a supported one, if any. */
export function supportedLocale(discordLocale: string | null | undefined): Locale | null {
  if (!discordLocale) return null;
  if (discordLocale.startsWith('fr')) return 'fr';
  if (discordLocale.startsWith('en')) return 'en';
  return null;
}

/** Ephemeral replies follow the user's Discord language when supported, the server's otherwise. */
export function localeFor(
  userLocale: string | null | undefined,
  guildLocale: Locale | null | undefined,
): Locale {
  return supportedLocale(userLocale) ?? guildLocale ?? 'fr';
}
