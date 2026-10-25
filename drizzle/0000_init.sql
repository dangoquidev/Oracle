CREATE TABLE "competitions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" jsonb NOT NULL,
	"scoring" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_competitions" (
	"guild_id" text NOT NULL,
	"competition_id" text NOT NULL,
	CONSTRAINT "guild_competitions_guild_id_competition_id_pk" PRIMARY KEY("guild_id","competition_id")
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"pause_reason" text,
	"locale" text,
	"ping_role_id" text,
	"channel_id" text,
	"time_zone" text,
	"publish_weekday" smallint,
	"publish_hour" smallint,
	"publish_minute" smallint,
	"lock_mode" text,
	"lock_offset_minutes" integer,
	"recap_frequency" text,
	"reminders_enabled" boolean,
	"reminder_offset_minutes" integer,
	"configured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider_ref" text NOT NULL,
	"competition_id" text NOT NULL,
	"tournament_id" integer NOT NULL,
	"week_id" integer NOT NULL,
	"match_day" integer,
	"team1_id" integer,
	"team2_id" integer,
	"scheduled_at" timestamp with time zone NOT NULL,
	"best_of" smallint NOT NULL,
	"status" text NOT NULL,
	"winner_side" smallint,
	"team1_score" smallint,
	"team2_score" smallint,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_provider_ref_unique" UNIQUE("provider_ref")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "predictions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"match_id" integer NOT NULL,
	"winner_side" smallint NOT NULL,
	"score_team1" smallint,
	"score_team2" smallint,
	"submitted_at" timestamp with time zone NOT NULL,
	"points" integer,
	"scored_at" timestamp with time zone,
	CONSTRAINT "predictions_guild_id_user_id_match_id_unique" UNIQUE("guild_id","user_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "publication_weeks" (
	"publication_id" integer NOT NULL,
	"guild_id" text NOT NULL,
	"week_id" integer NOT NULL,
	CONSTRAINT "publication_weeks_publication_id_week_id_pk" PRIMARY KEY("publication_id","week_id"),
	CONSTRAINT "publication_weeks_guild_id_week_id_unique" UNIQUE("guild_id","week_id")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "publications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"competition_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "seasons_competition_id_key_unique" UNIQUE("competition_id","key")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "teams_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider_name" text NOT NULL,
	"short_name" text NOT NULL,
	"logo_url" text,
	"emoji_id" text,
	CONSTRAINT "teams_provider_name_unique" UNIQUE("provider_name")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tournaments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"competition_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"provider_ref" text NOT NULL,
	"name" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	CONSTRAINT "tournaments_provider_ref_unique" UNIQUE("provider_ref")
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "weeks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "weeks_tournament_id_name_unique" UNIQUE("tournament_id","name")
);
--> statement-breakpoint
ALTER TABLE "guild_competitions" ADD CONSTRAINT "guild_competitions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_competitions" ADD CONSTRAINT "guild_competitions_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team1_id_teams_id_fk" FOREIGN KEY ("team1_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team2_id_teams_id_fk" FOREIGN KEY ("team2_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_weeks" ADD CONSTRAINT "publication_weeks_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_weeks" ADD CONSTRAINT "publication_weeks_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_scheduled_at_index" ON "matches" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_week_id_index" ON "matches" USING btree ("week_id");--> statement-breakpoint
CREATE INDEX "predictions_match_id_index" ON "predictions" USING btree ("match_id");