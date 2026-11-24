ALTER TABLE "workout_schedule" DROP CONSTRAINT "workout_schedule_user_day_slot_unique";--> statement-breakpoint
ALTER TABLE "workout_schedule" ADD COLUMN "start_min" integer;--> statement-breakpoint
-- Slots become exact times: the hour logs were recorded at (SLOT_START_HOUR: 07:00, 13:00, 18:00).
UPDATE "workout_schedule" SET "start_min" = CASE "slot" WHEN 'morning' THEN 420 WHEN 'afternoon' THEN 780 ELSE 1080 END;--> statement-breakpoint
ALTER TABLE "workout_schedule" ALTER COLUMN "start_min" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "workout_schedule_user_day_idx" ON "workout_schedule" USING btree ("user_id","day_of_week");--> statement-breakpoint
ALTER TABLE "workout_schedule" ADD CONSTRAINT "workout_schedule_start_range" CHECK ("workout_schedule"."start_min" between 0 and 1439);--> statement-breakpoint
ALTER TABLE "workout_schedule" ADD CONSTRAINT "workout_schedule_ends_same_day" CHECK ("workout_schedule"."start_min" + "workout_schedule"."duration_min" <= 1440);