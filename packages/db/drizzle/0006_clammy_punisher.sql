ALTER TABLE "news_items" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "content_status" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "content_scraped_at" timestamp;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "content_chars" integer;