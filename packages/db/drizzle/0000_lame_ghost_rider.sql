CREATE TYPE "public"."carousel_status" AS ENUM('draft', 'ready', 'scheduled', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."image_source" AS ENUM('pinterest', 'upload_raw', 'upload_generic');--> statement-breakpoint
CREATE TYPE "public"."image_status" AS ENUM('raw', 'processing', 'generic', 'review_pending', 'review_kept', 'review_skipped', 'done', 'fail');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('waiting', 'active', 'completed', 'failed', 'delayed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "carousels" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text,
	"status" "carousel_status" DEFAULT 'draft' NOT NULL,
	"slides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_at" timestamp,
	"publer_job_id" text,
	"publer_post_id" text,
	"source_news_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	"category" text,
	"performance_score" real DEFAULT 0,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" "image_status" DEFAULT 'raw' NOT NULL,
	"source" "image_source" NOT NULL,
	"hash" text,
	"width" integer,
	"height" integer,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"embedding" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"queue_name" text NOT NULL,
	"bull_job_id" text,
	"kind" text NOT NULL,
	"status" "job_status" DEFAULT 'waiting' NOT NULL,
	"payload" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"summary" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pinterest_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"source" text,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pinterest_keywords_keyword_unique" UNIQUE("keyword")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pinterest_swipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_id" integer,
	"action" text NOT NULL,
	"mode" text NOT NULL,
	"swiped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"password_hash" text,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pinterest_swipes" ADD CONSTRAINT "pinterest_swipes_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carousels_status_idx" ON "carousels" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carousels_scheduled_idx" ON "carousels" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "images_hash_unique" ON "images" USING btree ("hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "images_status_idx" ON "images" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "images_source_idx" ON "images" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_kind_idx" ON "jobs_log" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "news_url_unique" ON "news_items" USING btree ("url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_fetched_idx" ON "news_items" USING btree ("fetched_at");