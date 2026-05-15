CREATE TABLE IF NOT EXISTS "text_cut_videos" (
  "id" serial PRIMARY KEY NOT NULL,
  "word" text NOT NULL,
  "language" text DEFAULT 'fr' NOT NULL,
  "frames" jsonb DEFAULT '[]'::jsonb,
  "rendered_video_key" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "text_cut_videos_status_idx" ON "text_cut_videos" ("status");
CREATE INDEX IF NOT EXISTS "text_cut_videos_created_idx" ON "text_cut_videos" ("created_at");
