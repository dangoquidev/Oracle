import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import type { CompetitionSource } from '../../domain/competition/competition.js';
import type { ScoringRules } from '../../domain/competition/scoring.js';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// ── Calendar cache (shared by every server) ────────────────────────────────

export const competitions = pgTable('competitions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  source: jsonb('source').$type<CompetitionSource>().notNull(),
  scoring: jsonb('scoring').$type<ScoringRules>().notNull(),
});

export const seasons = pgTable(
  'seasons',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id),
    key: text('key').notNull(),
    name: text('name').notNull(),
  },
  (table) => [unique().on(table.competitionId, table.key)],
);

export const tournaments = pgTable('tournaments', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitions.id),
  seasonId: integer('season_id')
    .notNull()
    .references(() => seasons.id),
  providerRef: text('provider_ref').notNull().unique(),
  name: text('name').notNull(),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
});

export const weeks = pgTable(
  'weeks',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [unique().on(table.tournamentId, table.name)],
);

export const teams = pgTable('teams', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  providerName: text('provider_name').notNull().unique(),
  shortName: text('short_name').notNull(),
  logoUrl: text('logo_url'),
  emojiId: text('emoji_id'),
});

export const matches = pgTable(
  'matches',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    providerRef: text('provider_ref').notNull().unique(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id),
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id),
    weekId: integer('week_id')
      .notNull()
      .references(() => weeks.id),
    matchDay: integer('match_day'),
    team1Id: integer('team1_id').references(() => teams.id),
    team2Id: integer('team2_id').references(() => teams.id),
    scheduledAt: timestamptz('scheduled_at').notNull(),
    bestOf: smallint('best_of').notNull(),
    status: text('status', { enum: ['scheduled', 'completed', 'nullified'] }).notNull(),
    winnerSide: smallint('winner_side'),
    team1Score: smallint('team1_score'),
    team2Score: smallint('team2_score'),
    syncedAt: timestamptz('synced_at').notNull().defaultNow(),
  },
  (table) => [index().on(table.scheduledAt), index().on(table.weekId)],
);

// ── Per-server data ─────────────────────────────────────────────────────────

export const guilds = pgTable('guilds', {
  id: text('id').primaryKey(),
  status: text('status', { enum: ['unconfigured', 'active', 'paused', 'left'] }).notNull(),
  pauseReason: text('pause_reason', { enum: ['role-deleted', 'channel-deleted'] }),
  locale: text('locale', { enum: ['fr', 'en'] }),
  pingRoleId: text('ping_role_id'),
  channelId: text('channel_id'),
  timeZone: text('time_zone'),
  publishWeekday: smallint('publish_weekday'),
  publishHour: smallint('publish_hour'),
  publishMinute: smallint('publish_minute'),
  lockMode: text('lock_mode', { enum: ['per-day', 'per-match'] }),
  lockOffsetMinutes: integer('lock_offset_minutes'),
  recapFrequency: text('recap_frequency', { enum: ['daily', 'weekly'] }),
  remindersEnabled: boolean('reminders_enabled'),
  reminderOffsetMinutes: integer('reminder_offset_minutes'),
  configuredAt: timestamptz('configured_at'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const guildCompetitions = pgTable(
  'guild_competitions',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.competitionId] })],
);

export const predictions = pgTable(
  'predictions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id),
    userId: text('user_id').notNull(),
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id),
    winnerSide: smallint('winner_side').notNull(),
    scoreTeam1: smallint('score_team1'),
    scoreTeam2: smallint('score_team2'),
    submittedAt: timestamptz('submitted_at').notNull(),
    /** pending: not judged yet; scored: points awarded; void: match cancelled, prediction ignored. */
    outcome: text('outcome', { enum: ['pending', 'scored', 'void'] })
      .notNull()
      .default('pending'),
    points: integer('points'),
    correctWinner: boolean('correct_winner'),
    exactScore: boolean('exact_score'),
    scoredAt: timestamptz('scored_at'),
  },
  (table) => [
    unique().on(table.guildId, table.userId, table.matchId),
    index().on(table.matchId),
    index().on(table.guildId, table.outcome),
  ],
);

export const publications = pgTable('publications', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  guildId: text('guild_id')
    .notNull()
    .references(() => guilds.id),
  channelId: text('channel_id').notNull(),
  messageId: text('message_id'),
  publishedAt: timestamptz('published_at').notNull(),
  fingerprint: text('fingerprint'),
});

export const publicationWeeks = pgTable(
  'publication_weeks',
  {
    publicationId: integer('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    guildId: text('guild_id').notNull(),
    weekId: integer('week_id')
      .notNull()
      .references(() => weeks.id),
  },
  // A week is announced at most once per server.
  (table) => [
    primaryKey({ columns: [table.publicationId, table.weekId] }),
    unique().on(table.guildId, table.weekId),
  ],
);

export const lockOverrides = pgTable(
  'lock_overrides',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id),
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id),
    state: text('state', { enum: ['open', 'closed'] }).notNull(),
    setBy: text('set_by').notNull(),
    setAt: timestamptz('set_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.matchId] })],
);

/** One-off notifications already sent (reminders, vote reveals), keyed per server. */
export const dispatchLog = pgTable(
  'dispatch_log',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id),
    key: text('key').notNull(),
    dispatchedAt: timestamptz('dispatched_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.key] })],
);

/** Admin corrections or cancellations of a match result, for one server. */
export const resultOverrides = pgTable(
  'result_overrides',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id),
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id),
    cancelled: boolean('cancelled').notNull(),
    winnerSide: smallint('winner_side'),
    team1Score: smallint('team1_score'),
    team2Score: smallint('team2_score'),
    setBy: text('set_by').notNull(),
    setAt: timestamptz('set_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.matchId] })],
);

/** Players excluded from a server's game by an admin (their predictions are kept). */
export const playerBans = pgTable(
  'player_bans',
  {
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id),
    userId: text('user_id').notNull(),
    bannedBy: text('banned_by').notNull(),
    reason: text('reason'),
    bannedAt: timestamptz('banned_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);
