ALTER TABLE "carousels" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "carousels" ADD COLUMN "angle" jsonb;--> statement-breakpoint
ALTER TABLE "carousels" ADD COLUMN "candidate_angles" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "carousels" ADD COLUMN "error" text;