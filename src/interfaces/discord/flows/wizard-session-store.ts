import type { GuildId, UserId } from '../../../domain/shared/ids.js';
import type { WizardState } from './configure-wizard.js';

/** Interaction tokens last 15 minutes; a wizard left alone longer is forgotten. */
const DEFAULT_TTL_MS = 15 * 60_000;

/**
 * In-memory drafts of the /configure wizard, one per admin and server.
 * Nothing is persisted before the final confirmation, so losing them on restart is harmless.
 */
export class WizardSessionStore {
  private readonly sessions = new Map<string, { state: WizardState; expiresAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  get(guildId: GuildId, userId: UserId): WizardState | null {
    const key = keyOf(guildId, userId);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(key);
      return null;
    }
    return session.state;
  }

  set(guildId: GuildId, userId: UserId, state: WizardState): void {
    this.purgeExpired();
    this.sessions.set(keyOf(guildId, userId), { state, expiresAt: this.now() + this.ttlMs });
  }

  delete(guildId: GuildId, userId: UserId): void {
    this.sessions.delete(keyOf(guildId, userId));
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [key, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(key);
  }
}

function keyOf(guildId: GuildId, userId: UserId): string {
  return `${guildId}:${userId}`;
}
