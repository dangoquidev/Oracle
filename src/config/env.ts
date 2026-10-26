import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, 'must be the application id'),
  /** When set, slash commands are registered on this server only (instant updates while developing). */
  DISCORD_DEV_GUILD_ID: z.string().regex(/^\d+$/).optional(),
  /** Servers hosting the team logo emojis. The bot needs "Manage Expressions" there. */
  EMOJI_GUILD_IDS: csv,

  DATABASE_URL: z.url(),

  LEAGUEPEDIA_BOT_USER: z.string().min(1),
  LEAGUEPEDIA_BOT_PASSWORD: z.string().min(1),
  /** Appended to the User-Agent so Leaguepedia admins can reach the operator. */
  LEAGUEPEDIA_CONTACT: z.string().default('https://github.com/'),
  LEAGUEPEDIA_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).default(8000),

  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** Discord webhook receiving operator alerts (errors, failing health, restarts). Disabled when empty. */
  ALERT_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.url({ protocol: /^https$/ }).optional()),
  /** User pinged on error alerts. */
  ALERT_MENTION_USER_ID: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional()),
});

function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
