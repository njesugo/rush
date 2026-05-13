CREATE TABLE IF NOT EXISTS "reels" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text,
	"youtube_url" text NOT NULL,
	"angle" text NOT NULL,
	"source_video_id" integer,
	"storyboard" jsonb,
	"hook" text,
	"broll_keys" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"youtube_id" text NOT NULL,
	"youtube_url" text NOT NULL,
	"title" text,
	"channel" text,
	"duration_s" real,
	"storage_key" text,
	"transcript" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reels" ADD CONSTRAINT "reels_source_video_id_source_videos_id_fk" FOREIGN KEY ("source_video_id") REFERENCES "public"."source_videos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reels_status_idx" ON "reels" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reels_source_video_idx" ON "reels" USING btree ("source_video_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_videos_yt_id_unique" ON "source_videos" USING btree ("youtube_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_videos_status_idx" ON "source_videos" USING btree ("status");