"use client";

import { CalendarRange, NotebookPen, Plus, Target } from "lucide-react";
import { useState } from "react";
import type { MonthCalendar as MonthCalendarData, WeekCalendar as WeekData, WeekHistory, WorkoutLogView } from "@/lib/queries/workout";
import { cn } from "@/lib/cn";
import { CardShell } from "@/components/dashboard/card-shell";
import { WorkoutPeriodSelect, type WorkoutData } from "@/components/dashboard/workout-cards";
import { TYPE_LABEL, WorkoutDialog, nowTarget, type WorkoutTarget } from "@/components/forms/workout-dialogs";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Pager } from "@/components/ui/pager";
import { Button, EmptyState, IconButton, MonthStepper, StatusDot, ToggleGroup, TrendBadge } from "@/components/ui/primitives";
import { useFitCount, usePaged } from "@/components/ui/use-fit";
import { useSearchParamSetter } from "@/components/ui/use-search-param";
import { useViewerTz } from "@/components/ui/viewer-tz";
import { MonthCalendar, TypeLegend } from "./month-calendar";
import { WeekCalendar } from "./week-calendar";

const TYPE_FILL = { strength: "hatch-dark", cardio: "hatch-mid", mobility: "hatch-light" } as const;

/** Done / Planned / Missed swatches for the week view. */
function StatusLegend() {
  const items = [
    { label: "Done", cls: "bg-[#232325]" },
    { label: "Planned", cls: "border border-[#d4d5d8] bg-[#eeeff1]" },
    { label: "Missed", cls: "hatch-mid" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[3px]", i.cls)} /> {i.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Schedule (week / month calendar) */

export function ScheduleCard({
  view,
  week,
  calendar,
  currentKey,
  className,
}: {
  view: "weekly" | "monthly";
  week: WeekData | null;
  calendar: MonthCalendarData | null;
  /** "YYYY-MM" of the current month (from the server). */
  currentKey: string;
  className?: string;
}) {
  const tz = useViewerTz();
  const { setMany, pending } = useSearchParamSetter();
  const [target, setTarget] = useState<WorkoutTarget | null>(null);

  const stepMonth = (delta: number) => {
    if (!calendar) return;
    const [y, m] = calendar.key.split("-").map(Number);
    const idx = y * 12 + (m - 1) + delta;
    setMany({ cm: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}` });
  };

  return (
    <CardShell
      icon={<CalendarRange />}
      title="Schedule"
      className={className}
      actions={
        <>
          {view === "monthly" && calendar ? (
            <MonthStepper
              label={calendar.label}
              onPrev={() => stepMonth(-1)}
              onNext={() => stepMonth(1)}
              nextDisabled={calendar.key >= currentKey}
            />
          ) : week ? (
            <>
              {!week.isCurrent && (
                <Button variant="secondary" className="h-8 px-2.5 text-[13px]" onClick={() => setMany({ wk: null })}>
                  Today
                </Button>
              )}
              <MonthStepper
                unit="week"
                label={week.label}
                onPrev={() => setMany({ wk: week.prevKey === week.currentKey ? null : week.prevKey })}
                onNext={() => setMany({ wk: week.nextKey === week.currentKey ? null : week.nextKey })}
              />
            </>
          ) : null}
          <ToggleGroup
            label="Schedule view"
            value={view}
            onChange={(v) => setMany({ cal: v === "monthly" ? "monthly" : null, cm: null, wk: null })}
            options={[
              { value: "weekly", label: "Week" },
              { value: "monthly", label: "Month" },
            ]}
          />
          <IconButton label="Add a plan or workout" onClick={() => setTarget(nowTarget(tz, "plan"))}>
            <Plus className="size-4" />
          </IconButton>
        </>
      }
    >
      <div className={cn("flex flex-col transition-opacity fit:min-h-0 fit:flex-1", pending && "opacity-50")}>
        {view === "monthly" && calendar ? (
          <>
            <div className="mb-2.5 flex shrink-0 flex-wrap items-center justify-between gap-2 short:mb-1.5">
              <p className="text-[13px] text-muted">
                <span className="font-medium text-ink tabular">{calendar.sessions}</span> session{calendar.sessions === 1 ? "" : "s"} ·{" "}
                <span className="tabular">{calendar.minutes}</span> min ·{" "}
                <span className="tabular">{calendar.activeDays}</span> active days · click a day to open its week
              </p>
              <TypeLegend />
            </div>
            <div className="fit:min-h-0 fit:flex-1">
              <MonthCalendar days={calendar.days} onPickDay={(d) => setMany({ cal: null, cm: null, wk: d.weekKey })} />
            </div>
          </>
        ) : week ? (
          <>
            <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 short:mb-1.5">
              <p className="text-[13px] text-muted">
                <span className="font-medium text-ink tabular">{week.sessions}</span> session{week.sessions === 1 ? "" : "s"} ·{" "}
                <span className="tabular">{week.minutes}</span> min
                <span className="short:hidden"> · drag to add, move or resize</span>
              </p>
              <StatusLegend />
            </div>
            <WeekCalendar
              week={week}
              onOpen={setTarget}
              draft={target?.mode === "new" ? target : null}
              className="fit:min-h-0 fit:flex-1"
            />
          </>
        ) : null}
      </div>
      <WorkoutDialog target={target} onClose={() => setTarget(null)} />
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Progress (+ 12-week strip) */

/** Sessions per week by type, last N weeks, with the current plan as a dashed line. */
function ActivityStrip({ history }: { history: WeekHistory }) {
  const planned = history[history.length - 1]?.planned ?? 0;
  const top = Math.max(...history.map((w) => w.sessions), planned, 1);
  return (
    <figure aria-label="Workout sessions per week" className="flex min-h-[72px] flex-col fit:min-h-0 fit:flex-1">
      <div className="relative min-h-0 flex-1">
        {planned > 0 && (
          <div
            className="absolute inset-x-0 z-10 border-t-2 border-dashed border-accent/70"
            style={{ bottom: `${Math.round((planned / top) * 10000) / 100}%` }}
            title={`Plan this week: ${planned} sessions`}
          />
        )}
        <div className="absolute inset-0 flex items-end gap-1.5">
          {history.map((w) => (
            <div
              key={w.key}
              title={`Week of ${w.label}: ${w.sessions} sessions, ${w.minutes} min${w.planned ? ` (plan ${w.planned})` : ""}`}
              className={cn(
                "flex min-h-px flex-1 flex-col-reverse overflow-hidden rounded-t-md rounded-b-sm bg-soft",
                w.isCurrent && "ring-2 ring-accent/50 ring-offset-1",
              )}
              style={{ height: `${Math.round((Math.max(w.sessions, 0.04 * top) / top) * 10000) / 100}%` }}
            >
              {(["strength", "cardio", "mobility"] as const).map((t) =>
                w[t] ? <span key={t} className={TYPE_FILL[t]} style={{ height: `${Math.round((w[t] / w.sessions) * 10000) / 100}%` }} /> : null,
              )}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-1.5 flex shrink-0 justify-between text-[11px] text-muted">
        <span>{history[0]?.label}</span>
        <span>{history.length} weeks</span>
        <span className="font-semibold text-ink">Now</span>
      </figcaption>
    </figure>
  );
}

export function ProgressCard({ data, history, className }: { data: WorkoutData; history: WeekHistory; className?: string }) {
  const { pending } = useSearchParamSetter();
  const past = history.filter((w) => !w.isCurrent);
  const avg = past.length ? past.reduce((s, w) => s + w.sessions, 0) / past.length : 0;
  const plannedWeeks = past.filter((w) => w.planned > 0);
  const hitWeeks = plannedWeeks.filter((w) => w.sessions >= w.planned).length;

  return (
    <CardShell icon={<Target />} title="Progress" className={className} actions={<WorkoutPeriodSelect value={data.period} />}>
      <div className={cn("flex flex-col transition-opacity fit:min-h-0 fit:flex-1", pending && "opacity-50")}>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <p className="text-[34px] font-semibold leading-none tracking-tight tabular short:text-[28px]">{data.sessions}</p>
          <TrendBadge value={data.change} />
          <p className="text-[14px] text-ink-2">
            sessions <span className="text-muted">· {data.minutes} min</span>
          </p>
        </div>
        <p className="mt-1 shrink-0 text-[13px] text-muted short:hidden">
          {data.period === "weekly" ? "This week so far" : "This month so far"} vs the same point last{" "}
          {data.period === "weekly" ? "week" : "month"}
        </p>

        <ul className="mt-3 grid shrink-0 gap-2.5 short:mt-2 short:gap-1.5">
          {data.byType.map((t) => {
            const pct = t.planned ? Math.min(1, t.done / t.planned) : t.done ? 1 : 0;
            return (
              <li key={t.type}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span className={cn("size-2.5 rounded-[3px]", TYPE_FILL[t.type])} />
                    {t.label}
                  </span>
                  <span className="flex items-center gap-2 tabular">
                    {t.done}/{t.planned}
                    <span className="text-muted">· {t.minutes} min</span>
                    <StatusDot ok={t.onTrack} className="size-3" />
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-soft">
                  <div className={cn("h-full rounded-full", TYPE_FILL[t.type])} style={{ width: `${Math.round(pct * 1000) / 10}%` }} />
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mb-2 mt-4 shrink-0 text-[12px] font-medium text-ink-2 short:mt-3">Sessions per week</p>
        <ActivityStrip history={history} />
        <p className="mt-2 shrink-0 text-[12px] text-muted">
          Avg <span className="font-medium text-ink tabular">{avg.toFixed(1)}</span>/week · on plan{" "}
          <span className="font-medium text-ink tabular">
            {hitWeeks}/{plannedWeeks.length}
          </span>{" "}
          weeks
        </p>
      </div>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Log */

function LogRow({ log, onOpen }: { log: WorkoutLogView; onOpen: () => void }) {
  const detail = log.summary || log.notes;
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onOpen}
        title="Edit"
        className="flex h-[60px] w-full items-center gap-3 rounded-xl border border-line px-3 text-left transition hover:border-faint focus-visible:outline-2 focus-visible:outline-accent"
      >
        <CategoryIcon name={log.type} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{log.title}</span>
            <time className="shrink-0 text-[12px] text-muted tabular" title={log.ago}>
              {log.dateLabel} · {log.timeLabel}
            </time>
          </span>
          <span className="block truncate text-[12px] text-muted">
            {TYPE_LABEL[log.type]} · {log.durationMin} min{detail ? ` · ${detail}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

export function WorkoutLogCard({ logs, className }: { logs: WorkoutLogView[]; className?: string }) {
  const tz = useViewerTz();
  const [target, setTarget] = useState<WorkoutTarget | null>(null);
  const [ref, count] = useFitCount<HTMLUListElement>(60, 8, 6);
  const p = usePaged(logs, count);
  return (
    <CardShell
      icon={<NotebookPen />}
      title="Workout Log"
      className={className}
      actions={
        <Button className="h-8 px-3 text-[13px]" onClick={() => setTarget(nowTarget(tz, "log"))}>
          <Plus className="size-3.5" /> Log
        </Button>
      }
    >
      <ul ref={ref} className="flex flex-col gap-2 overflow-hidden fit:min-h-0 fit:flex-1">
        {logs.length ? (
          p.pageItems.map((l) => <LogRow key={l.id} log={l} onOpen={() => setTarget({ mode: "log", log: l })} />)
        ) : (
          <EmptyState>No workouts logged yet.</EmptyState>
        )}
      </ul>
      <Pager {...p} noun="sessions" />
      <WorkoutDialog target={target} onClose={() => setTarget(null)} />
    </CardShell>
  );
}
