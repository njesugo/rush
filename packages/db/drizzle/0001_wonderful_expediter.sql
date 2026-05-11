ALTER TABLE "news_items" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "geo_score" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "keyword_score" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "editorial_score" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "final_score" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "money" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_final_score_idx" ON "news_items" USING btree ("final_score");