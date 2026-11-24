-- The composite foreign key below needs this first.
ALTER TABLE "notes" ADD CONSTRAINT "notes_id_user_unique" UNIQUE("id","user_id");--> statement-breakpoint
CREATE TABLE "note_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"note_id" integer,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_images" ADD CONSTRAINT "note_images_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_images" ADD CONSTRAINT "note_images_note_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_images_user_idx" ON "note_images" USING btree ("user_id","note_id");