CREATE TABLE "dispatch_log" (
	"guild_id" text NOT NULL,
	"key" text NOT NULL,
	"dispatched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dispatch_log_guild_id_key_pk" PRIMARY KEY("guild_id","key")
);
--> statement-breakpoint
CREATE TABLE "lock_overrides" (
	"guild_id" text NOT NULL,
	"match_id" integer NOT NULL,
	"state" text NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lock_overrides_guild_id_match_id_pk" PRIMARY KEY("guild_id","match_id")
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "dispatch_log" ADD CONSTRAINT "dispatch_log_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock_overrides" ADD CONSTRAINT "lock_overrides_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock_overrides" ADD CONSTRAINT "lock_overrides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;