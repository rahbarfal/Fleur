import type { Metadata } from "next";
import { startOfWeek } from "date-fns";
import { PageGrid } from "@/components/dashboard/card-shell";
import { ProgressCard, ScheduleCard, WorkoutLogCard } from "@/components/workout/workout-page-cards";
import { getMonthCalendar, getRecentWorkoutLogs, getWeekCalendar, getWeeklyHistory, getWorkout } from "@/lib/queries/workout";
import { dateIn, monthKey, nowIn, parsePeriod } from "@/lib/dates";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workout · Fleur" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Monday 00:00 of `?wk=2026-11-16` (any day of that week works), else of this week. */
function pickWeek(raw: unknown, tz: string, now: Date): Date {
  const m = typeof raw === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return startOfWeek(dateIn(tz, y, mo - 1, d), { weekStartsOn: 1 });
    }
  }
  return startOfWeek(now, { weekStartsOn: 1 });
}

export default async function WorkoutPage({ searchParams }: { searchParams: SearchParams }) {
  const [v, sp] = await Promise.all([requireViewer(), searchParams]);
  const now = nowIn(v.tz);
  const period = parsePeriod(sp.workout, ["weekly", "monthly"] as const, "weekly");
  const cal = sp.cal === "monthly" ? "monthly" : "weekly";
  const cm = typeof sp.cm === "string" ? /^(\d{4})-(\d{2})$/.exec(sp.cm) : null;
  const [workout, history, week, calendar, logs] = await Promise.all([
    getWorkout(v, period, now),
    getWeeklyHistory(v, 12, now),
    cal === "weekly" ? getWeekCalendar(v, pickWeek(sp.wk, v.tz, now), now) : null,
    cal === "monthly"
      ? cm && Number(cm[2]) >= 1 && Number(cm[2]) <= 12
        ? getMonthCalendar(v, Number(cm[1]), Number(cm[2]) - 1, now)
        : getMonthCalendar(v, now.getFullYear(), now.getMonth(), now)
      : null,
    getRecentWorkoutLogs(v, 200),
  ]);

  return (
    <PageGrid className="fit:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <ScheduleCard
        className="md:col-span-2 fit:col-span-8 fit:row-span-2"
        view={cal}
        week={week}
        calendar={calendar}
        currentKey={monthKey(now)}
      />
      <ProgressCard className="fit:col-span-4" data={workout} history={history} />
      <WorkoutLogCard className="md:col-span-2 fit:col-span-4" logs={logs} />
    </PageGrid>
  );
}
