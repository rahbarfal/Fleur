ALTER TABLE "user" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "demo_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "user_demo_expires_idx" ON "user" USING btree ("demo_expires_at") WHERE "user"."is_demo";