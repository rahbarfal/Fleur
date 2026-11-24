ALTER TABLE "note_images" DROP CONSTRAINT "note_images_note_fk";
--> statement-breakpoint
DROP INDEX "note_images_user_idx";--> statement-breakpoint
CREATE INDEX "note_images_user_idx" ON "note_images" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "note_images" DROP COLUMN "note_id";