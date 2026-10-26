ALTER TABLE "predictions" ADD COLUMN "correct_winner" boolean;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "exact_score" boolean;--> statement-breakpoint
CREATE INDEX "predictions_guild_id_outcome_index" ON "predictions" USING btree ("guild_id","outcome");--> statement-breakpoint
-- Backfill predictions judged before the breakdown existed: any point means the right winner,
-- more than the winner reward means the exact score.
UPDATE "predictions" AS p
SET "correct_winner" = p."points" > 0,
    "exact_score" = p."points" > (c."scoring" ->> 'correctWinner')::int
FROM "matches" AS m
JOIN "competitions" AS c ON c."id" = m."competition_id"
WHERE m."id" = p."match_id" AND p."outcome" = 'scored';
