"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import { Dumbbell, Footprints, PersonStanding, type LucideIcon } from "lucide-react";
import type { WorkoutType } from "@/lib/constants";
import { WEEKDAYS_SHORT } from "@/lib/dates";
import type { CalendarDay } from "@/lib/queries/workout";
import { cn } from "@/lib/cn";
import { TYPE_LABEL } from "@/components/forms/workout-dialogs";

export const TYPE_ICON: Record<WorkoutType, LucideIcon> = {
  strength: Dumbbell,
  cardio: Footprints,
  mobility: PersonStanding,
};

const CHIP: Record<WorkoutType, string> = {
  strength: "bg-[#232325] text-white",
  cardio: "bg-[#9a9ba0] text-white",
  mobility: "border border-line bg-soft text-ink",
};

export function TypeChip({ type, className }: { type: WorkoutType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full", CHIP[type], className)}
      aria-hidden
    >
      <Icon className="size-3.5" strokeWidth={2} />
    </span>
  );
}

export function TypeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
      {(["strength", "cardio", "mobility"] as const).map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <TypeChip type={t} className="size-5 [&>svg]:size-3" /> {TYPE_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

function DayDetails({ day }: { day: CalendarDay }) {
  return (
    <div className="w-72 rounded-xl border border-line bg-card p-3.5 shadow-pop">
      <p className="mb-2.5 text-[13px] font-semibold text-ink">{day.label}</p>
      {day.logs.length > 0 && (
        <ul className="grid gap-2.5">
          {day.logs.map((l) => (
            <li key={l.id} className="flex gap-2.5">
              <TypeChip type={l.type} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-tight text-ink">{l.title}</p>
                <p className="text-[12px] text-muted">
                  {l.time} · {l.durationMin} min · {TYPE_LABEL[l.type]}
                </p>
                {l.summary && <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{l.summary}</p>}
                {l.notes && <p className="mt-0.5 text-[12px] italic text-muted">{l.notes}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {day.planned.length > 0 && (
        <>
          <p className={cn("mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint", day.logs.length > 0 && "mt-3")}>
            Planned
          </p>
          <ul className="grid gap-1.5">
            {day.planned.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 text-[12px] text-muted">
                <TypeChip type={p.type} className="size-5 opacity-50 [&>svg]:size-3" />
                <span>
                  <span className="text-ink-2">{p.title}</span> · {p.time} · {p.durationMin} min
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function describe(day: CalendarDay) {
  const done = day.logs.map((l) => `${l.title} at ${l.time} (${TYPE_LABEL[l.type]}, ${l.durationMin} min)`).join(", ");
  const plan = day.planned.map((p) => `${p.title} planned at ${p.time}`).join(", ");
  return [day.label, done || (day.planned.length ? "" : "no activity"), plan].filter(Boolean).join(" — ");
}

/** Month grid: each day shows only icons for its activities; hover a day for details, click it to open its week. */
export function MonthCalendar({
  days,
  compact = false,
  onPickDay,
}: {
  days: CalendarDay[];
  compact?: boolean;
  onPickDay?: (day: CalendarDay) => void;
}) {
  const weeks = days.length / 7;
  const maxChips = compact ? 1 : 3;
  return (
    <div
      className={cn("grid grid-cols-7 fit:h-full", compact ? "h-[260px] gap-1 short:gap-0.5" : "h-[420px] gap-1.5 short:gap-1")}
      style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(0, 1fr))` }}
    >
      {WEEKDAYS_SHORT.map((d) => (
        <span key={d} className={cn("text-center text-muted", compact ? "text-[11px] leading-none" : "pb-0.5 text-[12px]")}>
          {compact ? d.slice(0, 2) : d}
        </span>
      ))}
      {days.map((day) => {
        const hasDetails = day.logs.length > 0 || day.planned.length > 0;
        const pickable = Boolean(onPickDay) && day.inMonth;
        const cell = (
          <div
            tabIndex={hasDetails || pickable ? 0 : undefined}
            role={pickable ? "button" : undefined}
            aria-label={hasDetails ? describe(day) : pickable ? day.label : undefined}
            onClick={pickable ? () => onPickDay!(day) : undefined}
            onKeyDown={pickable ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPickDay!(day)) : undefined}
            title={pickable ? "Open this week" : undefined}
            className={cn(
              "relative overflow-hidden border transition outline-none",
              compact ? "min-h-4 rounded-md" : "min-h-6 rounded-lg",
              day.inMonth ? "border-line bg-card" : "border-transparent bg-transparent",
              hasDetails && "cursor-default hover:border-faint hover:bg-soft focus-visible:border-accent",
              pickable && "cursor-pointer hover:border-faint hover:bg-soft focus-visible:border-accent",
              day.isToday && "border-accent/60 ring-2 ring-accent/20",
            )}
          >
            <span
              className={cn(
                "absolute leading-none tabular",
                compact ? "left-1.5 top-1 text-[10px]" : "left-2 top-1.5 text-[12px]",
                !day.inMonth && "text-faint/60",
                day.inMonth && "text-ink-2",
                day.isToday && "font-semibold text-accent",
              )}
            >
              {day.day}
            </span>
            {day.logs.length > 0 && (
              <span className={cn("absolute flex items-center gap-0.5", compact ? "bottom-0.5 right-0.5" : "bottom-1 right-1")}>
                {day.logs.slice(0, maxChips).map((l) => (
                  <TypeChip
                    key={l.id}
                    type={l.type}
                    className={compact ? "size-4 [&>svg]:size-2.5" : "size-5 [&>svg]:size-3"}
                  />
                ))}
                {!compact && day.logs.length > maxChips && <span className="text-[10px] text-muted">+{day.logs.length - maxChips}</span>}
              </span>
            )}
          </div>
        );

        if (!hasDetails) return <div key={day.key} className="flex min-h-0 flex-col [&>div]:flex-1">{cell}</div>;
        return (
          <HoverCard.Root key={day.key} openDelay={80} closeDelay={60}>
            <HoverCard.Trigger asChild>
              <div className="flex min-h-0 flex-col [&>div]:flex-1">{cell}</div>
            </HoverCard.Trigger>
            <HoverCard.Portal>
              <HoverCard.Content
                side="top"
                align="center"
                sideOffset={6}
                collisionPadding={12}
                className="z-50 data-[state=open]:animate-fade-in"
              >
                <DayDetails day={day} />
              </HoverCard.Content>
            </HoverCard.Portal>
          </HoverCard.Root>
        );
      })}
    </div>
  );
}
