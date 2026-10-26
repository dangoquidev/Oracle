ALTER TABLE "publication_weeks" DROP CONSTRAINT "publication_weeks_guild_id_week_id_unique";--> statement-breakpoint
ALTER TABLE "publication_weeks" ADD COLUMN "day_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "publication_weeks" ADD CONSTRAINT "publication_weeks_guild_id_week_id_day_key_unique" UNIQUE("guild_id","week_id","day_key");