ALTER TABLE "reels" ALTER COLUMN "youtube_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reels" ALTER COLUMN "angle" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "script" text;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "voice_storage_key" text;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "screenshot_keys" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "storyboard_v2" jsonb;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "rendered_video_key" text;
