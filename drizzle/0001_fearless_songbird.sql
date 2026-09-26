ALTER TABLE "ai_drafts" ADD COLUMN "mode" text DEFAULT 'fresh' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD COLUMN "edited_by" uuid;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_edited_by_members_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;