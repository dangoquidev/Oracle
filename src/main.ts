import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { CheckGuildAccess } from './application/use-cases/check-guild-access.js';
import { ConfigureGuild } from './application/use-cases/configure-guild.js';
import { GetConfigurationDraft } from './application/use-cases/get-configuration-draft.js';
import { GetPredictionJourney } from './application/use-cases/get-prediction-journey.js';
import { HandleResourceDeleted } from './application/use-cases/handle-resource-deleted.js';
import { LeaveGuild } from './application/use-cases/leave-guild.js';
import { ListLockTargets } from './application/use-cases/list-lock-targets.js';
import { ListWeekMatches } from './application/use-cases/list-week-matches.js';
import { LockCalculatorFactory } from './application/use-cases/lock-calculator.js';
import { PublishDueWeeks } from './application/use-cases/publish-due-weeks.js';
import { ReconcileGuilds } from './application/use-cases/reconcile-guilds.js';
import { RefreshAnnouncements } from './application/use-cases/refresh-announcements.js';
import { RegisterGuild } from './application/use-cases/register-guild.js';
import { SendLockNotifications } from './application/use-cases/send-lock-notifications.js';
import { SetLockOverride } from './application/use-cases/set-lock-override.js';
import { SubmitPrediction } from './application/use-cases/submit-prediction.js';
import { SyncSchedule } from './application/use-cases/sync-schedule.js';
import { SyncTeamEmojis } from './application/use-cases/sync-team-emojis.js';
import { COMPETITIONS } from './config/competitions.js';
import { loadEnv } from './config/env.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import { connectDatabase, pingDatabase, runMigrations } from './infrastructure/db/client.js';
import { startHealthServer } from './infrastructure/health/health-server.js';
import { LeaguepediaClient } from './infrastructure/leaguepedia/leaguepedia-client.js';
import { LeaguepediaProvider } from './infrastructure/leaguepedia/leaguepedia-provider.js';
import { createLogger } from './infrastructure/logger/pino-logger.js';
import { seedCompetitions } from './infrastructure/repositories/competition-seeder.js';
import { DrizzleCalendarRepository } from './infrastructure/repositories/drizzle-calendar-repository.js';
import { DrizzleDispatchLog } from './infrastructure/repositories/drizzle-dispatch-log.js';
import { DrizzleGuildRepository } from './infrastructure/repositories/drizzle-guild-repository.js';
import { DrizzleLockOverrideRepository } from './infrastructure/repositories/drizzle-lock-override-repository.js';
import { DrizzlePredictionRepository } from './infrastructure/repositories/drizzle-prediction-repository.js';
import { DrizzlePublicationRepository } from './infrastructure/repositories/drizzle-publication-repository.js';
import { JobScheduler, type RecurringTask } from './infrastructure/scheduler/job-scheduler.js';
import { DiscordEmojiStore } from './interfaces/discord/adapters/discord-emoji-store.js';
import { DiscordGuildMessenger } from './interfaces/discord/adapters/discord-guild-messenger.js';
import { DiscordPermissionChecker } from './interfaces/discord/adapters/discord-permission-checker.js';
import { commandDefinitions } from './interfaces/discord/commands/registry.js';
import type { DiscordDependencies } from './interfaces/discord/dependencies.js';
import { reconcileOnReady, registerGuildEvents } from './interfaces/discord/events.js';
import { WizardSessionStore } from './interfaces/discord/flows/wizard-session-store.js';
import { createInteractionRouter } from './interfaces/discord/interaction-router.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));
const USER_AGENT_VERSION = '0.1.0';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const clock = new SystemClock();

  // ── Persistence ───────────────────────────────────────────────────────────
  const database = connectDatabase(env.DATABASE_URL);
  await runMigrations(database.db, MIGRATIONS_FOLDER);
  await seedCompetitions(database.db, COMPETITIONS);
  const guilds = new DrizzleGuildRepository(database.db);
  const calendar = new DrizzleCalendarRepository(database.db);
  const predictions = new DrizzlePredictionRepository(database.db);
  const publications = new DrizzlePublicationRepository(database.db);
  const lockOverrides = new DrizzleLockOverrideRepository(database.db);
  const dispatchLog = new DrizzleDispatchLog(database.db);
  const locks = new LockCalculatorFactory(calendar, lockOverrides);

  // ── External services ─────────────────────────────────────────────────────
  const leaguepedia = new LeaguepediaProvider(
    new LeaguepediaClient({
      credentials: { username: env.LEAGUEPEDIA_BOT_USER, password: env.LEAGUEPEDIA_BOT_PASSWORD },
      userAgent: `PronoBot/${USER_AGENT_VERSION} (${env.LEAGUEPEDIA_CONTACT})`,
      minIntervalMs: env.LEAGUEPEDIA_MIN_INTERVAL_MS,
      logger: logger.child({ module: 'leaguepedia' }),
    }),
    logger.child({ module: 'leaguepedia' }),
  );
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const messenger = new DiscordGuildMessenger(client, logger);
  const permissions = new DiscordPermissionChecker(client);
  const emojiStore = new DiscordEmojiStore(client, env.EMOJI_GUILD_IDS);

  // ── Use cases ─────────────────────────────────────────────────────────────
  const registerGuild = new RegisterGuild(guilds, messenger, logger);
  const leaveGuild = new LeaveGuild(guilds);
  const handleResourceDeleted = new HandleResourceDeleted(guilds, messenger, logger);
  const syncSchedule = new SyncSchedule(leaguepedia, calendar, COMPETITIONS, clock, logger);
  const syncTeamEmojis = new SyncTeamEmojis(calendar, emojiStore, clock, logger);
  const publishDueWeeks = new PublishDueWeeks(guilds, calendar, publications, messenger, clock, logger);
  const refreshAnnouncements = new RefreshAnnouncements(
    guilds,
    publications,
    calendar,
    messenger,
    clock,
    logger,
  );
  const sendLockNotifications = new SendLockNotifications(
    guilds,
    publications,
    calendar,
    predictions,
    dispatchLog,
    locks,
    messenger,
    clock,
    logger,
  );

  const deps: DiscordDependencies = {
    logger,
    competitions: COMPETITIONS,
    wizardSessions: new WizardSessionStore(),
    emojiHostGuildIds: new Set(env.EMOJI_GUILD_IDS),
    useCases: {
      checkGuildAccess: new CheckGuildAccess(guilds),
      getConfigurationDraft: new GetConfigurationDraft(guilds, COMPETITIONS),
      configureGuild: new ConfigureGuild(guilds, permissions, COMPETITIONS),
      getPredictionJourney: new GetPredictionJourney(
        guilds,
        publications,
        calendar,
        predictions,
        locks,
        clock,
      ),
      submitPrediction: new SubmitPrediction(guilds, calendar, predictions, locks),
      registerGuild,
      leaveGuild,
      handleResourceDeleted,
      reconcileGuilds: new ReconcileGuilds(
        guilds,
        permissions,
        registerGuild,
        leaveGuild,
        handleResourceDeleted,
      ),
      listWeekMatches: new ListWeekMatches(guilds, calendar, predictions, locks, COMPETITIONS, clock),
      listLockTargets: new ListLockTargets(guilds, calendar, clock),
      setLockOverride: new SetLockOverride(guilds, calendar, lockOverrides, clock),
    },
  };

  // ── Jobs ──────────────────────────────────────────────────────────────────
  const scheduler = new JobScheduler(env.DATABASE_URL, logger.child({ module: 'scheduler' }));
  const tasks: RecurringTask[] = [
    {
      name: 'schedule-sync',
      cron: '0 */6 * * *',
      run: async () => {
        try {
          await syncSchedule.execute();
        } finally {
          // Competitions that did sync still deserve fresh logos and announcements.
          if (env.EMOJI_GUILD_IDS.length > 0) await syncTeamEmojis.execute();
          await refreshAnnouncements.executeForAll();
        }
      },
    },
    {
      name: 'guild-tick',
      cron: '* * * * *',
      run: async () => {
        await publishDueWeeks.executeForAll();
        await sendLockNotifications.executeForAll();
      },
    },
  ];

  // ── Discord ───────────────────────────────────────────────────────────────
  const routeInteraction = createInteractionRouter(deps);
  client.on(Events.InteractionCreate, (interaction) => {
    void routeInteraction(interaction);
  });
  registerGuildEvents(client, deps);
  client.once(Events.ClientReady, (ready) => {
    void (async () => {
      logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'Connected to Discord');
      const commands = commandDefinitions(COMPETITIONS);
      if (env.DISCORD_DEV_GUILD_ID) await ready.application.commands.set(commands, env.DISCORD_DEV_GUILD_ID);
      else await ready.application.commands.set(commands);
      await reconcileOnReady(ready, deps);
      await scheduler.start(tasks);
      await scheduler.trigger('schedule-sync');
    })().catch((error: unknown) => {
      logger.error({ err: error }, 'Startup failed');
      process.exit(1);
    });
  });

  const health = await startHealthServer(env.HEALTH_PORT, {
    database: () => pingDatabase(database.pool),
    discord: () => client.isReady(),
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    void (async () => {
      health.close();
      await scheduler.stop().catch(() => undefined);
      await client.destroy();
      await database.close();
      process.exit(0);
    })();
  };
  process.once('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    shutdown('SIGINT');
  });

  await client.login(env.DISCORD_TOKEN);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
