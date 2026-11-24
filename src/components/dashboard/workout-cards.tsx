"use client";

import { Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import type { WorkoutType } from "@/lib/constants";
import type { MonthCalendar as MonthCalendarData, MonthProgress } from "@/lib/queries/workout";
import { cn } from "@/lib/cn";
import { PillSelect, StatusDot } from "@/components/ui/primitives";
import { useSearchParamSetter } from "@/components/ui/use-search-param";
import { MonthCalendar } from "@/components/workout/month-calendar";
import { CardShell, OpenLink } from "./card-shell";

export type WorkoutData = {
  period: "weekly" | "monthly";
  sessions: number;
  minutes: number;
  change: number | null;
  byType: { type: WorkoutType; label: string; done: number; planned: number; minutes: number; onTrack: boolean }[];
};

export function WorkoutPeriodSelect({ value }: { value: "weekly" | "monthly" }) {
  const { set } = useSearchParamSetter();
  return (
    <PillSelect aria-label="Period" value={value} onChange={(e) => set("workout", e.target.value)}>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
    </PillSelect>
  );
}

const TYPE_FILL = { strength: "hatch-dark", cardio: "hatch-mid", mobility: "hatch-light" } as const;

/**
 * This month at a glance: per type, sessions done out of every planned date in the
 * month (e.g. Strength 2/12), and the month calendar. Click a day to open its week.
 */
export function WorkoutCard({
  progress,
  calendar,
  className,
}: {
  progress: MonthProgress;
  calendar: MonthCalendarData;
  className?: string;
}) {
  const router = useRouter();
  return (
    <CardShell
      icon={<Activity />}
      title={`Workout · ${progress.monthLabel}`}
      className={className}
      actions={<OpenLink href="/workout?cal=monthly" label="Open Workout" />}
    >
      <dl className="grid shrink-0 grid-cols-3 gap-2">
        {progress.byType.map((t) => {
          const pct = t.planned ? Math.min(1, t.done / t.planned) : t.done ? 1 : 0;
          return (
            <div key={t.type} className="rounded-lg bg-soft px-2.5 py-2 short:py-1.5" title={`${t.label}: ${t.done} done of ${t.planned} planned this month`}>
              <dt className="flex items-center justify-between gap-1 text-[12px] text-muted">
                {t.label}
                <StatusDot ok={t.onTrack} className="size-3" />
              </dt>
              <dd className="mt-0.5 text-[18px] font-semibold leading-tight text-ink tabular short:text-[16px]">
                {t.done}
                <span className="text-[13px] font-medium text-muted">/{t.planned}</span>
              </dd>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-card">
                <div className={cn("h-full rounded-full", TYPE_FILL[t.type])} style={{ width: `${Math.round(pct * 1000) / 10}%` }} />
              </div>
            </div>
          );
        })}
      </dl>

      <div className="mt-3 short:mt-2 fit:min-h-0 fit:flex-1">
        <MonthCalendar days={calendar.days} compact onPickDay={(d) => router.push(`/workout?wk=${d.weekKey}`)} />
      </div>
    </CardShell>
  );
}
