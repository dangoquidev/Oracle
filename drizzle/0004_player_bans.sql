CREATE TABLE "player_bans" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"banned_by" text NOT NULL,
	"reason" text,
	"banned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_bans_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "player_bans" ADD CONSTRAINT "player_bans_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;