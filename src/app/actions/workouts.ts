"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import { addDays } from "date-fns";
import { z } from "zod";
import { db } from "@/db";
import { WORKOUT_TYPES, workoutLogs, workoutSchedule } from "@/db/schema";
import { dateIn, parseMinutes, weekdayIndex } from "@/lib/dates";
import { parseExercises } from "@/lib/workout";
import { requireViewer } from "@/lib/viewer";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";

/*
 * Weekly plans (workout_schedule) and logged sessions (workout_logs), at any time of day.
 * A session must end by midnight. Logs link to the plan they fulfil (schedule_id):
 * "Mark done" names the plan; otherwise the nearest unfinished plan that weekday
 * within 2 hours is used.
 */

const LINK_WINDOW_MIN = 120;
const ENDS_BY_MIDNIGHT = "A session has to end by midnight.";

const time = z
  .string("Pick a start time")
  .transform(parseMinutes)
  .pipe(z.number("Pick a start time").int().min(0).max(1439));
const startMin = z.number().int().min(0).max(1439);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required");
const title = z.string().trim().min(1, "Title is required").max(80);
const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive().optional());

/** Wall-clock date + minutes in the viewer's timezone. */
function startOf(tz: string, key: string, min: number) {
  const [y, m, d] = key.split("-").map(Number);
  return dateIn(tz, y, m - 1, d, Math.floor(min / 60), min % 60);
}

/**
 * The plan a session on `start` counts for: `explicit` if it's the viewer's and on that
 * weekday, else the nearest plan that weekday within 2 hours that no other log that day
 * already fulfils. `exceptLogId` is the log being edited.
 */
async function planFor(userId: string, tz: string, start: Date, min: number, explicit: number | undefined, exceptLogId?: number) {
  const weekday = weekdayIndex(start);
  const plans = await db
    .select({ id: workoutSchedule.id, startMin: workoutSchedule.startMin })
    .from(workoutSchedule)
    .where(and(eq(workoutSchedule.userId, userId), eq(workoutSchedule.dayOfWeek, weekday)));
  if (explicit !== undefined) return plans.some((p) => p.id === explicit) ? explicit : null;

  const dayStart = dateIn(tz, start.getFullYear(), start.getMonth(), start.getDate());
  const taken = await db
    .select({ planId: workoutLogs.scheduleId })
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.userId, userId),
        gte(workoutLogs.date, dayStart),
        lt(workoutLogs.date, addDays(dayStart, 1)),
        exceptLogId ? ne(workoutLogs.id, exceptLogId) : undefined,
      ),
    );
  const best = plans
    .filter((p) => !taken.some((t) => t.planId === p.id) && Math.abs(p.startMin - min) <= LINK_WINDOW_MIN)
    .sort((a, b) => Math.abs(a.startMin - min) - Math.abs(b.startMin - min))[0];
  return best?.id ?? null;
}

/** Shared checks for a log's time; returns an error or null. */
function logTimeProblem(start: Date, min: number, durationMin: number): string | null {
  if (min + durationMin > 24 * 60) return ENDS_BY_MIDNIGHT;
  // A minute of slack for clocks that differ a little.
  if (start.getTime() > Date.now() + 60_000) return "That time hasn't happened yet. Add it as a plan instead.";
  return null;
}

/* ------------------------------------------------------------------ Logs */

const LogInput = z.object({
  id: optionalId,
  date: dateKey,
  time,
  type: z.enum(WORKOUT_TYPES),
  title,
  durationMin: z.coerce.number().int().min(1, "At least 1 minute").max(600, "At most 600 minutes"),
  exercises: z.string().default("").transform(parseExercises),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
  /** Set by "Mark done" on a plan. */
  scheduleId: optionalId,
});

/** Records a finished session, or edits one (`id`). */
export async function saveWorkoutLog(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const { id, date, time: min, scheduleId, ...data } = LogInput.parse(formObject(fd));
    const start = startOf(v.tz, date, min);
    const problem = logTimeProblem(start, min, data.durationMin);
    if (problem) return { ok: false, error: problem };
    const planId = await planFor(v.id, v.tz, start, min, scheduleId, id);
    const values = { ...data, date: start, scheduleId: planId };
    if (id) {
      const updated = await db
        .update(workoutLogs)
        .set(values)
        .where(and(eq(workoutLogs.id, id), eq(workoutLogs.userId, v.id)))
        .returning({ id: workoutLogs.id });
      if (!updated.length) return NOT_FOUND;
    } else {
      await db.insert(workoutLogs).values({ ...values, userId: v.id });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Drag on the calendar: a logged session to another day/time, or a new length. */
export async function moveWorkoutLog(id: number, date: string, start: number, durationMin: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const input = z
      .object({ id: z.number().int().positive(), date: dateKey, start: startMin, durationMin: z.number().int().min(1).max(600) })
      .parse({ id, date, start, durationMin });
    const when = startOf(v.tz, input.date, input.start);
    const problem = logTimeProblem(when, input.start, input.durationMin);
    if (problem) return { ok: false, error: problem };
    const planId = await planFor(v.id, v.tz, when, input.start, undefined, input.id);
    const updated = await db
      .update(workoutLogs)
      .set({ date: when, durationMin: input.durationMin, scheduleId: planId })
      .where(and(eq(workoutLogs.id, input.id), eq(workoutLogs.userId, v.id)))
      .returning({ id: workoutLogs.id });
    if (!updated.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteWorkoutLog(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(workoutLogs)
      .where(and(eq(workoutLogs.id, z.number().int().parse(id)), eq(workoutLogs.userId, v.id)))
      .returning({ id: workoutLogs.id });
    if (!deleted.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ Weekly plans */

const PlanInput = z.object({
  id: optionalId,
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  time,
  type: z.enum(WORKOUT_TYPES),
  title,
  durationMin: z.coerce.number().int().min(5, "At least 5 minutes").max(600, "At most 600 minutes"),
});

/** Adds a weekly plan, or edits one (`id`). A day can hold several. */
export async function saveWorkoutPlan(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const { id, time: min, ...data } = PlanInput.parse(formObject(fd));
    if (min + data.durationMin > 24 * 60) return { ok: false, error: ENDS_BY_MIDNIGHT };
    const values = { ...data, startMin: min };
    if (id) {
      const updated = await db
        .update(workoutSchedule)
        .set(values)
        .where(and(eq(workoutSchedule.id, id), eq(workoutSchedule.userId, v.id)))
        .returning({ id: workoutSchedule.id });
      if (!updated.length) return NOT_FOUND;
    } else {
      await db.insert(workoutSchedule).values({ ...values, userId: v.id });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Drag on the calendar: a weekly plan to another weekday/time (every week), or a new length. */
export async function moveWorkoutPlan(id: number, dayOfWeek: number, start: number, durationMin: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const input = z
      .object({
        id: z.number().int().positive(),
        dayOfWeek: z.number().int().min(0).max(6),
        start: startMin,
        durationMin: z.number().int().min(5).max(600),
      })
      .parse({ id, dayOfWeek, start, durationMin });
    if (input.start + input.durationMin > 24 * 60) return { ok: false, error: ENDS_BY_MIDNIGHT };
    const updated = await db
      .update(workoutSchedule)
      .set({ dayOfWeek: input.dayOfWeek, startMin: input.start, durationMin: input.durationMin })
      .where(and(eq(workoutSchedule.id, input.id), eq(workoutSchedule.userId, v.id)))
      .returning({ id: workoutSchedule.id });
    if (!updated.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Removes a weekly plan. Sessions already logged for it stay (and are no longer linked). */
export async function deleteWorkoutPlan(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const planId = z.number().int().parse(id);
    const deleted = await db.transaction(async (tx) => {
      const rows = await tx
        .delete(workoutSchedule)
        .where(and(eq(workoutSchedule.id, planId), eq(workoutSchedule.userId, v.id)))
        .returning({ id: workoutSchedule.id });
      if (rows.length) {
        await tx
          .update(workoutLogs)
          .set({ scheduleId: null })
          .where(and(eq(workoutLogs.userId, v.id), eq(workoutLogs.scheduleId, planId)));
      }
      return rows.length > 0;
    });
    if (!deleted) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
