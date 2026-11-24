import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  formatDistanceToNowStrict,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/*
 * Timezones. The server may run in UTC (Vercel), so "today", "this month" etc.
 * are computed in the viewer's zone with TZDate. date-fns keeps the zone through
 * startOfMonth/addDays/format…, and getMonth()/getDate()/getHours() read it.
 * Dates coming from the database are plain instants: wrap them with `zoned()`
 * before formatting or comparing by day.
 */

/** The current moment in `tz`. */
export function nowIn(tz: string): TZDate {
  return new TZDate(Date.now(), tz);
}

/** An instant (e.g. from the database) seen in `tz`. */
export function zoned(d: Date, tz: string): TZDate {
  return new TZDate(d.getTime(), tz);
}

/** Wall-clock date/time in `tz` (month is 0-based, overflow rolls like Date). */
export function dateIn(tz: string, year: number, month: number, day = 1, hour = 0, minute = 0): TZDate {
  return new TZDate(year, month, day, hour, minute, tz);
}

/**
 * A form value ("yyyy-MM-dd" or "yyyy-MM-ddTHH:mm") read as wall-clock time in `tz`.
 * Returns an Invalid Date for anything else.
 */
export function parseLocalInput(value: string, tz: string, defaultHour = 0): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return new Date(Number.NaN);
  const [, y, mo, d, h, mi] = m;
  const date = dateIn(tz, Number(y), Number(mo) - 1, Number(d), h ? Number(h) : defaultHour, mi ? Number(mi) : 0);
  return new Date(date.getTime());
}

export type Period = "daily" | "weekly" | "monthly";

export const PERIODS: Period[] = ["daily", "weekly", "monthly"];

export function parsePeriod<T extends Period>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * The current calendar period, plus the same elapsed span of the previous
 * period, so partial periods compare fairly (Mon–Tue vs last Mon–Tue).
 */
export function periodRange(period: Period, now: Date) {
  let start: Date;
  let prevStart: Date;
  if (period === "daily") {
    start = startOfDay(now);
    prevStart = addDays(start, -1);
  } else if (period === "weekly") {
    start = startOfWeek(now, { weekStartsOn: 1 });
    prevStart = addDays(start, -7);
  } else {
    start = startOfMonth(now);
    prevStart = addMonths(start, -1);
  }
  const elapsed = now.getTime() - start.getTime();
  const prevEnd = new Date(prevStart.getTime() + elapsed);
  return { start, end: now, prevStart, prevEnd };
}

/** Monday = 0 … Sunday = 6 */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 435 → "07:15" (minutes after midnight; no Intl). */
export function minutesLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "07:15" → 435, or NaN for anything else. */
export function parseMinutes(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes after midnight of a zoned date (wrap database dates with `zoned()` first). */
export function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
