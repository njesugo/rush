CREATE TABLE IF NOT EXISTS "pinterest_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL,
	"url" text NOT NULL,
	"pin_url" text,
	"source" text,
	"action" text NOT NULL,
	"swiped_at" timestamp,
	"filename" text,
	"image_id" integer,
	"downloaded_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "pinterest_assets_worker_id_unique" UNIQUE("worker_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pinterest_assets" ADD CONSTRAINT "pinterest_assets_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pinterest_assets_action_idx" ON "pinterest_assets" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pinterest_assets_filename_idx" ON "pinterest_assets" USING btree ("filename");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pinterest_assets_source_idx" ON "pinterest_assets" USING btree ("source");