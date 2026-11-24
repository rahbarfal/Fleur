import "server-only";
import { and, asc, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { addDays, format, isSameDay, startOfDay, startOfWeek } from "date-fns";
import { db } from "@/db";
import {
  DAY_END_MIN,
  DAY_START_MIN,
  WORKOUT_TYPES,
  workoutLogs,
  workoutSchedule,
  type Exercise,
  type WorkoutLog,
  type WorkoutScheduleRow,
  type WorkoutType,
} from "@/db/schema";
import { dateIn, minutesLabel, minutesOf, periodRange, timeAgo, weekdayIndex, zoned, type Period } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import { WORKOUT_TYPE_LABEL, exerciseLines, exerciseSummary } from "@/lib/workout";
import type { Viewer } from "@/lib/viewer";

export { WORKOUT_TYPE_LABEL };

/*
 * Workouts are weekly plans (workout_schedule: a weekday + start time) and logged
 * sessions (workout_logs: an exact start + duration). A plan's occurrence on a
 * date is "done" when a log that day points at it (schedule_id), "missed" once
 * the day is over, else "planned". Times are wall-clock in the viewer's timezone.
 */

type ZonedLog = Omit<WorkoutLog, "date"> & { date: Date };

/** The viewer's workout logs, with dates in their timezone (so day/month comparisons are local). */
async function logsWhere(v: Viewer, ...conds: (SQL | undefined)[]): Promise<ZonedLog[]> {
  const rows = await db
    .select()
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, v.id), ...conds))
    .orderBy(asc(workoutLogs.date));
  return rows.map((l) => ({ ...l, date: zoned(l.date, v.tz) }));
}

type Plan = WorkoutScheduleRow & { from: Date };

async function plansOf(v: Viewer): Promise<Plan[]> {
  const rows = await db
    .select()
    .from(workoutSchedule)
    .where(eq(workoutSchedule.userId, v.id))
    .orderBy(asc(workoutSchedule.dayOfWeek), asc(workoutSchedule.startMin), asc(workoutSchedule.id));
  return rows.map((p) => ({ ...p, from: startOfDay(zoned(p.createdAt, v.tz)) }));
}

/** Whether a weekly plan happens on `day` (a zoned start of day): its weekday, and not before it was made. */
function occursOn(p: Plan, day: Date): boolean {
  return p.dayOfWeek === weekdayIndex(day) && day >= p.from;
}

/** A logged session with everything the calendar and the edit form need. */
export type WorkoutLogDetail = {
  id: number;
  title: string;
  type: WorkoutType;
  durationMin: number;
  notes: string | null;
  exercises: Exercise[];
  /** Exercises as editable lines ("Bench press 4x8 60kg"). */
  exercisesText: string;
  /** "Bench press 4×8 @60kg · Plank" */
  summary: string;
  /** yyyy-MM-dd in the viewer's timezone. */
  dateKey: string;
  startMin: number;
  /** The weekly plan this session counts for. */
  planId: number | null;
};

function logDetail(l: ZonedLog): WorkoutLogDetail {
  const exercises = l.exercises ?? [];
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    durationMin: l.durationMin,
    notes: l.notes,
    exercises,
    exercisesText: exerciseLines(exercises),
    summary: exerciseSummary(exercises),
    dateKey: format(l.date, "yyyy-MM-dd"),
    startMin: minutesOf(l.date),
    planId: l.scheduleId,
  };
}

/* ------------------------------------------------------------------ Progress */

export async function getWorkout(v: Viewer, period: Extract<Period, "weekly" | "monthly">, now: Date) {
  const { start, end, prevStart, prevEnd } = periodRange(period, now);
  const logsBetween = (from: Date, to: Date) => logsWhere(v, gte(workoutLogs.date, from), lt(workoutLogs.date, to));

  const [plans, current, previous] = await Promise.all([plansOf(v), logsBetween(start, end), logsBetween(prevStart, prevEnd)]);
  const minutes = current.reduce((s, l) => s + l.durationMin, 0);

  // Planned sessions so far this period, per type (every plan occurrence up to today).
  const planned: Record<WorkoutType, number> = { strength: 0, cardio: 0, mobility: 0 };
  for (let d = startOfDay(start); d <= now; d = addDays(d, 1)) {
    for (const p of plans) if (occursOn(p, d)) planned[p.type]++;
  }

  const byType = WORKOUT_TYPES.map((type) => {
    const logs = current.filter((l) => l.type === type);
    return {
      type,
      label: WORKOUT_TYPE_LABEL[type],
      done: logs.length,
      planned: planned[type],
      minutes: logs.reduce((s, l) => s + l.durationMin, 0),
      onTrack: logs.length >= planned[type],
    };
  });

  return {
    period,
    sessions: current.length,
    minutes,
    change: pctChange(current.length, previous.length),
    byType,
  };
}

/**
 * This calendar month per type: sessions done vs every planned date in the month
 * (a Monday plan counts once per Monday, from the day the plan was made).
 */
export async function getMonthProgress(v: Viewer, now: Date) {
  const start = dateIn(v.tz, now.getFullYear(), now.getMonth(), 1);
  const end = dateIn(v.tz, now.getFullYear(), now.getMonth() + 1, 1);
  const [plans, logs] = await Promise.all([plansOf(v), logsWhere(v, gte(workoutLogs.date, start), lt(workoutLogs.date, end))]);

  const planned: Record<WorkoutType, number> = { strength: 0, cardio: 0, mobility: 0 };
  for (let d: Date = start; d < end; d = addDays(d, 1)) {
    for (const p of plans) if (occursOn(p, d)) planned[p.type]++;
  }
  return {
    monthLabel: format(start, "MMMM"),
    byType: WORKOUT_TYPES.map((type) => {
      const done = logs.filter((l) => l.type === type).length;
      return { type, label: WORKOUT_TYPE_LABEL[type], done, planned: planned[type], onTrack: done >= planned[type] };
    }),
  };
}

export type MonthProgress = Awaited<ReturnType<typeof getMonthProgress>>;

/** Sessions per week by type for the last `weeks` weeks (oldest first), with how many were planned. */
export async function getWeeklyHistory(v: Viewer, weeks: number, now: Date) {
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 });
  const from = addDays(thisWeek, -7 * (weeks - 1));
  const [logs, plans] = await Promise.all([logsWhere(v, gte(workoutLogs.date, from)), plansOf(v)]);

  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(from, i * 7);
    const end = addDays(start, 7);
    const inWeek = logs.filter((l) => l.date >= start && l.date < end);
    const count = (t: WorkoutType) => inWeek.filter((l) => l.type === t).length;
    let planned = 0;
    for (let d = 0; d < 7; d++) planned += plans.filter((p) => occursOn(p, addDays(start, d))).length;
    return {
      key: format(start, "yyyy-MM-dd"),
      label: format(start, "d MMM"),
      strength: count("strength"),
      cardio: count("cardio"),
      mobility: count("mobility"),
      sessions: inWeek.length,
      minutes: inWeek.reduce((s, l) => s + l.durationMin, 0),
      planned,
      isCurrent: i === weeks - 1,
    };
  });
}

export type WeekHistory = Awaited<ReturnType<typeof getWeeklyHistory>>;

/* ------------------------------------------------------------------ Week calendar */

export type WeekEvent = {
  /** "p12" (plan) or "l40" (log): unique within a day. */
  key: string;
  kind: "plan" | "log";
  /** The plan's or the log's id. */
  id: number;
  title: string;
  type: WorkoutType;
  startMin: number;
  durationMin: number;
  /** Logs are always done; a plan is planned, or missed once its day is over. */
  status: "planned" | "missed" | "done";
  /** Logs only. */
  log: WorkoutLogDetail | null;
};

export type WeekDay = {
  /** yyyy-MM-dd */
  key: string;
  /** 0 = Monday … 6 = Sunday */
  dayOfWeek: number;
  /** "Mon" */
  short: string;
  dayNum: number;
  /** "Monday, 23 November" */
  label: string;
  isToday: boolean;
  isPast: boolean;
  /** By start time. */
  events: WeekEvent[];
};

/** "16 – 22 Nov 2026" · "30 Nov – 6 Dec 2026" · "29 Dec 2026 – 4 Jan 2027" */
function weekLabel(start: Date, end: Date): string {
  if (start.getFullYear() !== end.getFullYear()) return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
  if (start.getMonth() !== end.getMonth()) return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  return `${format(start, "d")} – ${format(end, "d MMM yyyy")}`;
}

/** One Mon–Sun week (`weekStart` = Monday 00:00 in the viewer's timezone) of plans and logged sessions. */
export async function getWeekCalendar(v: Viewer, weekStart: Date, now: Date) {
  const weekEnd = addDays(weekStart, 7);
  const today = startOfDay(now);
  const [logs, plans] = await Promise.all([
    logsWhere(v, gte(workoutLogs.date, weekStart), lt(workoutLogs.date, weekEnd)),
    plansOf(v),
  ]);

  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const dayLogs = logs.filter((l) => isSameDay(l.date, d));
    const events: WeekEvent[] = dayLogs.map((l) => ({
      key: `l${l.id}`,
      kind: "log",
      id: l.id,
      title: l.title,
      type: l.type,
      startMin: minutesOf(l.date),
      durationMin: l.durationMin,
      status: "done",
      log: logDetail(l),
    }));
    for (const p of plans) {
      // A done plan shows as its logged session instead.
      if (!occursOn(p, d) || dayLogs.some((l) => l.scheduleId === p.id)) continue;
      events.push({
        key: `p${p.id}`,
        kind: "plan",
        id: p.id,
        title: p.title,
        type: p.type,
        startMin: p.startMin,
        durationMin: p.durationMin,
        status: d < today ? "missed" : "planned",
        log: null,
      });
    }
    events.sort((a, b) => a.startMin - b.startMin || b.durationMin - a.durationMin);
    return {
      key: format(d, "yyyy-MM-dd"),
      dayOfWeek: i,
      short: format(d, "EEE"),
      dayNum: d.getDate(),
      label: format(d, "EEEE, d MMMM"),
      isToday: isSameDay(d, now),
      isPast: d < today,
      events,
    };
  });

  // 06:00–22:00, stretched to whole hours if something falls outside, so nothing is hidden.
  let startMin = DAY_START_MIN;
  let endMin = DAY_END_MIN;
  for (const e of days.flatMap((d) => d.events)) {
    startMin = Math.min(startMin, Math.floor(e.startMin / 60) * 60);
    endMin = Math.max(endMin, Math.ceil((e.startMin + e.durationMin) / 60) * 60);
  }
  endMin = Math.min(endMin, 24 * 60);

  const currentStart = startOfWeek(now, { weekStartsOn: 1 });
  const isCurrent = isSameDay(weekStart, currentStart);
  return {
    key: format(weekStart, "yyyy-MM-dd"),
    label: weekLabel(weekStart, addDays(weekStart, 6)),
    isCurrent,
    currentKey: format(currentStart, "yyyy-MM-dd"),
    prevKey: format(addDays(weekStart, -7), "yyyy-MM-dd"),
    nextKey: format(weekEnd, "yyyy-MM-dd"),
    days,
    range: { startMin, endMin },
    /** Minutes after midnight now (current week only), for the now-line. */
    nowMin: isCurrent ? minutesOf(now) : null,
    sessions: logs.length,
    minutes: logs.reduce((s, l) => s + l.durationMin, 0),
  };
}

export type WeekCalendar = Awaited<ReturnType<typeof getWeekCalendar>>;

/* ------------------------------------------------------------------ Log list */

export type WorkoutLogView = WorkoutLogDetail & {
  /** "Mon, 23 Nov" */
  dateLabel: string;
  /** "07:00" */
  timeLabel: string;
  ago: string;
};

export async function getRecentWorkoutLogs(v: Viewer, limit = 4): Promise<WorkoutLogView[]> {
  const rows = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, v.id))
    .orderBy(desc(workoutLogs.date), desc(workoutLogs.id))
    .limit(limit);
  return rows.map((row) => {
    const l = { ...row, date: zoned(row.date, v.tz) };
    return {
      ...logDetail(l),
      dateLabel: format(l.date, "EEE, d MMM"),
      timeLabel: minutesLabel(minutesOf(l.date)),
      ago: timeAgo(row.date),
    };
  });
}

/* ------------------------------------------------------------------ Month calendar */

export type CalendarDay = {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  label: string;
  /** Monday of this day's week (yyyy-MM-dd), to open it in the week view. */
  weekKey: string;
  logs: { id: number; title: string; type: WorkoutType; durationMin: number; time: string; summary: string; notes: string | null }[];
  /** Weekly plans still ahead (today and later) and not done yet. */
  planned: { id: number; title: string; type: WorkoutType; durationMin: number; time: string }[];
};

/** Mon–Sun calendar grid for one month (0-based) with that month's workout logs. */
export async function getMonthCalendar(v: Viewer, year: number, month: number, now: Date) {
  const first = dateIn(v.tz, year, month, 1);
  const last = dateIn(v.tz, year, month + 1, 0);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const gridEnd = addDays(startOfWeek(last, { weekStartsOn: 1 }), 7);
  const today = startOfDay(now);

  const [logs, plans] = await Promise.all([
    logsWhere(v, gte(workoutLogs.date, gridStart), lt(workoutLogs.date, gridEnd)),
    plansOf(v),
  ]);

  const days: CalendarDay[] = [];
  for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) {
    const inMonth = d.getMonth() === month;
    const dayLogs = inMonth ? logs.filter((l) => isSameDay(l.date, d)) : [];
    const planned =
      inMonth && d >= today
        ? plans
            .filter((p) => occursOn(p, d) && !dayLogs.some((l) => l.scheduleId === p.id))
            .map((p) => ({ id: p.id, title: p.title, type: p.type, durationMin: p.durationMin, time: minutesLabel(p.startMin) }))
        : [];
    days.push({
      key: format(d, "yyyy-MM-dd"),
      day: d.getDate(),
      inMonth,
      isToday: isSameDay(d, now),
      label: format(d, "EEEE, d MMMM yyyy"),
      weekKey: format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      logs: dayLogs.map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type,
        durationMin: l.durationMin,
        time: minutesLabel(minutesOf(l.date)),
        summary: exerciseSummary(l.exercises ?? []),
        notes: l.notes,
      })),
      planned,
    });
  }

  const monthLogs = logs.filter((l) => l.date.getMonth() === month && l.date.getFullYear() === year);
  return {
    key: format(first, "yyyy-MM"),
    label: format(first, "MMMM yyyy"),
    days,
    sessions: monthLogs.length,
    minutes: monthLogs.reduce((s, l) => s + l.durationMin, 0),
    activeDays: new Set(monthLogs.map((l) => format(l.date, "yyyy-MM-dd"))).size,
  };
}

export type MonthCalendar = Awaited<ReturnType<typeof getMonthCalendar>>;
