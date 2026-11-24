ALTER TABLE "workout_schedule" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing plans count from their first logged session (plans never logged start today).
UPDATE "workout_schedule" s SET "created_at" = l."first"
FROM (SELECT "schedule_id", "user_id", min("date") AS "first" FROM "workout_logs" WHERE "schedule_id" IS NOT NULL GROUP BY "schedule_id", "user_id") l
WHERE l."schedule_id" = s."id" AND l."user_id" = s."user_id" AND l."first" < s."created_at";
