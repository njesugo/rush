ALTER TABLE "carousels" ADD COLUMN "publer_post_url" text;--> statement-breakpoint
ALTER TABLE "carousels" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "carousels" ADD COLUMN "rendered_at" timestamp;--> statement-breakpoint
ALTER TABLE "carousels" ADD COLUMN "rendered_paths" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "carousels" ADD COLUMN "render_format" text DEFAULT '4:5';