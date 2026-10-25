CREATE TABLE "result_overrides" (
	"guild_id" text NOT NULL,
	"match_id" integer NOT NULL,
	"cancelled" boolean NOT NULL,
	"winner_side" smallint,
	"team1_score" smallint,
	"team2_score" smallint,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	CONSTRAINT "result_overrides_guild_id_match_id_pk" PRIMARY KEY("guild_id","match_id")
);
--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "outcome" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_overrides" ADD CONSTRAINT "result_overrides_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_overrides" ADD CONSTRAINT "result_overrides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;