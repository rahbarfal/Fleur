"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { moveWorkoutLog, moveWorkoutPlan } from "@/app/actions/workouts";
import { SNAP_MIN } from "@/lib/constants";
import { minutesLabel } from "@/lib/dates";
import type { WeekCalendar as WeekData, WeekEvent } from "@/lib/queries/workout";
import { cn } from "@/lib/cn";
import { TYPE_LABEL, type WorkoutTarget } from "@/components/forms/workout-dialogs";
import { TYPE_ICON } from "./month-calendar";

/*
 * Google-Calendar-style week: a time gutter and seven day columns.
 * Drag on empty space to add a session, drag a session to move it (also to
 * another day), drag its bottom edge to change its length; everything snaps to
 * 15 minutes. A plain click opens the form. Moving a weekly plan moves it for
 * every week; moving a logged session changes when you did it.
 */

/** Pointer travel (px) before a press becomes a drag. */
const DRAG_PX = 4;
/** Shortest session you can draw or resize to. */
const MIN_LEN = SNAP_MIN;
/** Shortest length used when deciding what overlaps (short sessions still take ~18px). */
const PACK_MIN = 30;

type Placed = WeekEvent & { day: number };
type Spot = { day: number; startMin: number; durationMin: number };
type Drag =
  | { kind: "create"; day: number; a: number; b: number; x: number; y: number; moved: boolean }
  | { kind: "move"; ev: Placed; grab: number; day: number; startMin: number; x: number; y: number; moved: boolean }
  | { kind: "resize"; ev: Placed; durationMin: number; x: number; y: number; moved: boolean };

const STYLE: Record<WeekEvent["status"], string> = {
  planned: "border border-[#d4d5d8] bg-[#eeeff1] text-ink hover:bg-[#e4e5e7]",
  done: "bg-[#232325] text-white hover:bg-black",
  missed: "hatch-mid text-ink",
};

const STATUS_TEXT: Record<WeekEvent["status"], string> = { planned: "Planned", done: "Done", missed: "Missed" };

/** Fraction → "12.3456%" (rounded, so server and browser print the same). */
const pct = (n: number) => `${Math.round(n * 1_000_000) / 10_000}%`;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const snap = (m: number) => Math.round(m / SNAP_MIN) * SNAP_MIN;
const snapDown = (m: number) => Math.floor(m / SNAP_MIN) * SNAP_MIN;
const snapUp = (m: number) => Math.ceil(m / SNAP_MIN) * SNAP_MIN;
const range = (start: number, minutes: number) => `${minutesLabel(start)}–${minutesLabel(Math.min(start + minutes, 1440))}`;

/** Side-by-side columns for events that overlap (greedy per cluster, like Google Calendar). */
function pack(events: { key: string; startMin: number; durationMin: number }[]) {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || b.durationMin - a.durationMin);
  let cluster: { key: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) out.set(c.key, { col: c.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const e of sorted) {
    const end = e.startMin + Math.max(e.durationMin, PACK_MIN);
    if (e.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex((x) => x <= e.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(end);
    } else colEnds[col] = end;
    cluster.push({ key: e.key, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

function describe(ev: WeekEvent): string {
  const extra = ev.log?.summary || ev.log?.notes;
  return `${ev.title} · ${range(ev.startMin, ev.durationMin)} · ${TYPE_LABEL[ev.type]} · ${STATUS_TEXT[ev.status]}${
    ev.kind === "plan" ? " (weekly plan)" : ""
  }${extra ? ` · ${extra}` : ""}`;
}

export function WeekCalendar({
  week,
  onOpen,
  compact = false,
  draft = null,
  className,
}: {
  week: WeekData;
  onOpen: (t: WorkoutTarget) => void;
  /** Overview card: small, click only. */
  compact?: boolean;
  /** The session being added (its form is open): stays on the calendar, pale, until saved or cancelled. */
  draft?: { dateKey: string; startMin: number; durationMin: number } | null;
  className?: string;
}) {
  const { startMin: from, endMin: to } = week.range;
  const span = to - from;
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Moves shown before the server confirms; dropped when new data arrives.
  const [moved, setMoved] = useState<{ week: WeekData; spots: Record<string, Spot> }>({ week, spots: {} });
  const spots = moved.week === week ? moved.spots : {};
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  // Every event on its (possibly just moved) day.
  const placed: Placed[] = week.days.flatMap((d) =>
    d.events.map((ev) => {
      const s = spots[ev.key];
      return s ? { ...ev, day: s.day, startMin: s.startMin, durationMin: s.durationMin } : { ...ev, day: d.dayOfWeek };
    }),
  );
  const byKey = new Map(placed.map((p) => [p.key, p]));

  const minuteAt = (clientY: number) => {
    const r = colsRef.current!.getBoundingClientRect();
    return from + ((clientY - r.top) / r.height) * span;
  };
  const dayAt = (clientX: number) => {
    const r = colsRef.current!.getBoundingClientRect();
    return clamp(Math.floor(((clientX - r.left) / r.width) * 7), 0, 6);
  };

  /** A plan or a log for an empty spot: future times default to a plan, past ones to a log. */
  const openNew = (day: number, startMin: number, durationMin: number) => {
    const d = week.days[day];
    const future = !d.isPast && !(d.isToday && week.nowMin !== null && startMin < week.nowMin);
    onOpen({ mode: "new", dateKey: d.key, dayOfWeek: day, startMin, durationMin, prefer: future ? "plan" : "log" });
  };

  const open = (ev: Placed) => {
    const original = week.days.find((d) => d.events.some((e) => e.key === ev.key)) ?? week.days[ev.day];
    if (ev.kind === "log" && ev.log) return onOpen({ mode: "log", log: ev.log });
    onOpen({
      mode: "plan",
      plan: { id: ev.id, title: ev.title, type: ev.type, dayOfWeek: original.dayOfWeek, startMin: ev.startMin, durationMin: ev.durationMin },
      occurrence: { dateKey: original.key, canMarkDone: original.isPast || original.isToday },
    });
  };

  const commit = (ev: Placed, spot: Spot) => {
    setMoved({ week, spots: { ...spots, [ev.key]: spot } });
    startSaving(async () => {
      const res =
        ev.kind === "log"
          ? await moveWorkoutLog(ev.id, week.days[spot.day].key, spot.startMin, spot.durationMin)
          : await moveWorkoutPlan(ev.id, spot.day, spot.startMin, spot.durationMin);
      if (!res.ok) {
        setError(res.error);
        setMoved((m) => {
          const rest = { ...m.spots };
          delete rest[ev.key];
          return { ...m, spots: rest };
        });
      }
    });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag) return;
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>("[data-ev]");
    const ev = el ? byKey.get(el.dataset.ev!) : undefined;
    const m = minuteAt(e.clientY);
    const base = { x: e.clientX, y: e.clientY, moved: false };
    if (ev) {
      if (!compact && target.closest("[data-resize]")) setDrag({ kind: "resize", ev, durationMin: ev.durationMin, ...base });
      else setDrag({ kind: "move", ev, grab: m - ev.startMin, day: ev.day, startMin: ev.startMin, ...base });
    } else {
      setDrag({ kind: "create", day: dayAt(e.clientX), a: m, b: m, ...base });
    }
    // On touch, empty space keeps scrolling the page (a tap still adds a session).
    if (ev || e.pointerType !== "touch") e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= DRAG_PX;
    if (!moved) return;
    if (compact) return setDrag(null);
    const m = minuteAt(e.clientY);
    if (drag.kind === "create") setDrag({ ...drag, moved, b: clamp(m, from, to) });
    else if (drag.kind === "move") {
      const len = drag.ev.durationMin;
      setDrag({ ...drag, moved, day: dayAt(e.clientX), startMin: clamp(snap(m - drag.grab), from, Math.max(from, to - len)) });
    } else {
      const end = clamp(snap(m), drag.ev.startMin + MIN_LEN, Math.min(to, 1440));
      setDrag({ ...drag, moved, durationMin: end - drag.ev.startMin });
    }
  };

  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moved) {
      if (d.kind === "create") openNew(d.day, clamp(snapDown(d.a), from, to - MIN_LEN), 30);
      else open(d.ev);
      return;
    }
    if (d.kind === "create") {
      const start = clamp(snapDown(Math.min(d.a, d.b)), from, to - MIN_LEN);
      const end = Math.max(start + MIN_LEN, Math.min(to, snapUp(Math.max(d.a, d.b))));
      openNew(d.day, start, end - start);
    } else if (d.kind === "move") {
      if (d.day !== d.ev.day || d.startMin !== d.ev.startMin) commit(d.ev, { day: d.day, startMin: d.startMin, durationMin: d.ev.durationMin });
    } else if (d.durationMin !== d.ev.durationMin) {
      commit(d.ev, { day: d.ev.day, startMin: d.ev.startMin, durationMin: d.durationMin });
    }
  };

  const hours: number[] = [];
  for (let h = Math.ceil(from / 60); h <= Math.floor(to / 60); h++) hours.push(h);
  const labelEvery = compact ? 4 : 1;
  const top = (min: number) => pct((min - from) / span);
  const height = (min: number) => pct(min / span);
  const dragging = drag?.moved && drag.kind !== "create" ? drag.ev.key : null;

  return (
    <div className={cn("flex select-none flex-col", className)}>
      {/* Day headers */}
      <div className={cn("grid shrink-0", compact ? "grid-cols-[1.75rem_repeat(7,minmax(0,1fr))]" : "grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]")}>
        <span />
        {week.days.map((d) => (
          <span
            key={d.key}
            className={cn(
              "flex justify-center pb-1.5 text-center",
              compact ? "items-baseline text-[11px]" : "flex-col items-center gap-0.5 text-[12px] sm:flex-row sm:items-baseline sm:gap-1",
            )}
            title={d.label}
          >
            <span className={d.isToday ? "font-medium text-accent" : "text-muted"}>{compact ? d.short.slice(0, 2) : d.short}</span>
            {!compact && (
              <span
                className={cn(
                  "inline-flex min-w-6 items-center justify-center rounded-full px-1 text-[13px] tabular",
                  d.isToday ? "bg-accent font-semibold text-white" : "font-medium text-ink",
                )}
              >
                {d.dayNum}
              </span>
            )}
          </span>
        ))}
      </div>

      <div
        className={cn(
          // Fixed height when the page scrolls (phones); fills the card on fitted desktop screens.
          "relative grid fit:h-auto fit:min-h-0 fit:flex-1",
          compact ? "h-[200px] grid-cols-[1.75rem_minmax(0,1fr)]" : "h-[620px] grid-cols-[2.75rem_minmax(0,1fr)]",
        )}
      >
        {/* Hour labels */}
        <div className="relative" aria-hidden>
          {hours.map((h, i) =>
            h % labelEvery === 0 && h * 60 < to ? (
              <span
                key={h}
                className={cn(
                  "absolute right-1.5 leading-none text-muted tabular",
                  compact ? "text-[9px]" : "text-[11px]",
                  i === 0 ? "translate-y-0" : "-translate-y-1/2",
                )}
                style={{ top: top(h * 60) }}
              >
                {compact ? String(h).padStart(2, "0") : minutesLabel(h * 60)}
              </span>
            ) : null,
          )}
        </div>

        {/* Day columns */}
        <div
          ref={colsRef}
          data-week-grid={`${from}-${to}`}
          className="relative grid grid-cols-7 overflow-hidden rounded-lg border border-line"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          {hours.map((h) =>
            h * 60 > from && h * 60 < to ? (
              <div
                key={h}
                aria-hidden
                className={cn("pointer-events-none absolute inset-x-0 border-t", h % 6 === 0 && !compact ? "border-[#dcdde0]" : "border-line")}
                style={{ top: top(h * 60) }}
              />
            ) : null,
          )}

          {week.days.map((d) => {
            const dayEvents = placed.filter((p) => p.day === d.dayOfWeek);
            const cols = pack(dayEvents);
            return (
              <div
                key={d.key}
                className={cn(
                  "relative border-l border-line first:border-l-0",
                  d.isToday ? "bg-accent/[0.04]" : d.isPast && "bg-soft/40",
                  !compact && "cursor-cell",
                )}
              >
                {dayEvents.map((ev) => {
                  const c = cols.get(ev.key) ?? { col: 0, cols: 1 };
                  const len = drag?.kind === "resize" && drag.moved && drag.ev.key === ev.key ? drag.durationMin : ev.durationMin;
                  return (
                    <Block
                      key={ev.key}
                      ev={ev}
                      compact={compact}
                      style={{
                        top: top(ev.startMin),
                        height: height(Math.min(len, to - ev.startMin)),
                        left: `calc(${pct(c.col / c.cols)} + 2px)`,
                        width: `calc(${pct(1 / c.cols)} - 4px)`,
                      }}
                      durationMin={len}
                      faded={dragging === ev.key && drag?.kind === "move"}
                      pending={saving && ev.key in spots}
                      onKeyOpen={() => open(ev)}
                    />
                  );
                })}

                {/* Being moved: a copy follows the pointer. */}
                {drag?.kind === "move" && drag.moved && drag.day === d.dayOfWeek && (
                  <Block
                    ev={{ ...drag.ev, startMin: drag.startMin }}
                    compact={compact}
                    style={{ top: top(drag.startMin), height: height(drag.ev.durationMin), left: "2px", width: "calc(100% - 4px)" }}
                    durationMin={drag.ev.durationMin}
                    ghost
                  />
                )}

                {/* Being drawn: the new session's time. */}
                {drag?.kind === "create" && drag.moved && drag.day === d.dayOfWeek && (() => {
                  const s = clamp(snapDown(Math.min(drag.a, drag.b)), from, to - MIN_LEN);
                  const e = Math.max(s + MIN_LEN, Math.min(to, snapUp(Math.max(drag.a, drag.b))));
                  return (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 z-30 rounded-md border-2 border-dashed border-accent bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent tabular"
                      style={{ top: top(s), height: height(e - s) }}
                    >
                      {range(s, e - s)}
                    </div>
                  );
                })()}

                {/* Released: the new session waits here, pale, while its form is open. */}
                {draft && draft.dateKey === d.key && !(drag?.kind === "create" && drag.moved) && (() => {
                  const s = clamp(draft.startMin, from, to - MIN_LEN);
                  const len = Math.max(MIN_LEN, Math.min(draft.durationMin, to - s));
                  return (
                    <div
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-0.5 z-30 overflow-hidden rounded-md border border-accent/40 bg-accent/10 text-accent/80 tabular animate-fade-in",
                        compact ? "min-h-[5px] rounded-[3px]" : "min-h-[18px] px-1.5 py-0.5 text-[11px] font-medium",
                      )}
                      style={{ top: top(s), height: height(len) }}
                    >
                      {!compact && (
                        <span className="block truncate">
                          New session · {range(s, len)}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {d.isToday && week.nowMin !== null && week.nowMin >= from && week.nowMin <= to && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-accent" style={{ top: top(week.nowMin) }}>
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-accent" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p
            role="alert"
            className="absolute inset-x-0 bottom-2 z-40 mx-auto w-fit max-w-[90%] rounded-lg bg-[#232325] px-3 py-1.5 text-center text-[12px] text-white shadow-pop"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Block({
  ev,
  style,
  durationMin,
  compact,
  faded = false,
  ghost = false,
  pending = false,
  onKeyOpen,
}: {
  ev: WeekEvent;
  style: CSSProperties;
  durationMin: number;
  compact: boolean;
  faded?: boolean;
  ghost?: boolean;
  pending?: boolean;
  onKeyOpen?: () => void;
}) {
  const Icon = TYPE_ICON[ev.type];
  const label = describe({ ...ev, durationMin });
  const twoLines = durationMin >= 50;
  return (
    <button
      type="button"
      data-ev={ghost ? undefined : ev.key}
      title={label}
      aria-label={label}
      tabIndex={ghost ? -1 : 0}
      // Mouse and touch go through the calendar's pointer handlers; this is for Enter / Space.
      onClick={(e) => e.detail === 0 && onKeyOpen?.()}
      className={cn(
        // A size container: on narrow blocks the name wins, the time and ✓ give way.
        "@container absolute z-10 flex touch-none flex-col overflow-hidden rounded-md text-left transition-[opacity,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        compact ? "min-h-[5px] rounded-[3px]" : "min-h-[18px] cursor-grab px-1.5 py-[3px] text-[11px] leading-tight active:cursor-grabbing",
        STYLE[ev.status],
        faded && "opacity-30",
        ghost && "pointer-events-none z-30 shadow-pop ring-2 ring-accent",
        pending && "opacity-70",
      )}
      style={style}
    >
      {!compact &&
        (twoLines ? (
          <>
            <span className="flex w-full min-w-0 items-center gap-1 font-medium">
              <Icon className="size-3 shrink-0 @max-[64px]:hidden" strokeWidth={2.2} />
              <span className="truncate">{ev.title}</span>
              {ev.status === "done" && <Check className="ml-auto size-3 shrink-0 @max-[90px]:hidden" strokeWidth={2.5} />}
            </span>
            <span className="truncate opacity-75 tabular">
              <span className="@max-[68px]:hidden">{range(ev.startMin, durationMin)}</span>
              <span className="hidden @max-[68px]:inline">{minutesLabel(ev.startMin)}</span>
            </span>
          </>
        ) : (
          <span className="flex w-full min-w-0 items-center gap-1">
            <Icon className="size-3 shrink-0 @max-[64px]:hidden" strokeWidth={2.2} />
            <span className="min-w-0 truncate font-medium">{ev.title}</span>
            <span className="ml-auto shrink-0 opacity-70 tabular @max-[130px]:hidden">{minutesLabel(ev.startMin)}</span>
            {ev.status === "done" && <Check className="size-3 shrink-0 @max-[90px]:hidden" strokeWidth={2.5} />}
          </span>
        ))}
      {!compact && !ghost && <span data-resize className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" aria-hidden />}
    </button>
  );
}
