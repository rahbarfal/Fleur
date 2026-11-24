"use client";

import { format } from "date-fns";
import { Check, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { deleteWorkoutLog, deleteWorkoutPlan, saveWorkoutLog, saveWorkoutPlan } from "@/app/actions/workouts";
import { WORKOUT_TYPES, type WorkoutType } from "@/lib/constants";
import { MONTHS_SHORT, WEEKDAYS_SHORT, minutesLabel, minutesOf, nowIn, weekdayIndex } from "@/lib/dates";
import type { WorkoutLogDetail } from "@/lib/queries/workout";
import { WORKOUT_TYPE_LABEL } from "@/lib/workout";
import { Modal } from "@/components/ui/modal";
import { Button, Field, FormError, Input, Segmented, Select, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { useViewerTz } from "@/components/ui/viewer-tz";

export const TYPE_LABEL = WORKOUT_TYPE_LABEL;
const TYPE_OPTIONS = WORKOUT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }));
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type PlanLite = { id: number; title: string; type: WorkoutType; dayOfWeek: number; startMin: number; durationMin: number };

/** What the workout dialog opens on. */
export type WorkoutTarget =
  /** An empty spot on the calendar (or the + / Log buttons). */
  | { mode: "new"; dateKey: string; dayOfWeek: number; startMin: number; durationMin: number; prefer: "plan" | "log" }
  /** A weekly plan; `occurrence` is the date it was clicked on (for "Mark done"). */
  | { mode: "plan"; plan: PlanLite; occurrence: { dateKey: string; canMarkDone: boolean } | null }
  | { mode: "log"; log: WorkoutLogDetail };

/** "Mon 23 Nov" from yyyy-MM-dd (no Intl, no timezone). */
function dayLabel(key: string, dayOfWeek: number): string {
  const [, m, d] = key.split("-").map(Number);
  return `${WEEKDAYS_SHORT[dayOfWeek]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

const range = (start: number, minutes: number) => `${minutesLabel(start)}–${minutesLabel(Math.min(start + minutes, 1440))}`;

/**
 * A new session for today (the + and Log buttons): a log starts now (rounded down
 * to 5 minutes), a plan at the next full hour.
 */
export function nowTarget(tz: string, prefer: "plan" | "log"): WorkoutTarget {
  const now = nowIn(tz);
  const min = minutesOf(now);
  return {
    mode: "new",
    dateKey: format(now, "yyyy-MM-dd"),
    dayOfWeek: weekdayIndex(now),
    startMin: prefer === "log" ? Math.floor(min / 5) * 5 : Math.min(22 * 60, Math.ceil((min + 1) / 60) * 60),
    durationMin: prefer === "log" ? 45 : 30,
    prefer,
  };
}

export function WorkoutDialog({ target, onClose }: { target: WorkoutTarget | null; onClose: () => void }) {
  const title =
    target?.mode === "plan" ? target.plan.title : target?.mode === "log" ? "Edit workout" : "Add to calendar";
  const description =
    target?.mode === "plan"
      ? `Weekly plan · every ${WEEKDAYS_LONG[target.plan.dayOfWeek]} ${range(target.plan.startMin, target.plan.durationMin)}`
      : target?.mode === "log"
        ? "A session you did."
        : "Plan a session that repeats every week, or log one you did.";
  return (
    <Modal open={target !== null} onOpenChange={(o) => !o && onClose()} title={title} description={description} size="sm">
      {target && <WorkoutForm key={JSON.stringify(target)} target={target} onDone={onClose} />}
    </Modal>
  );
}

function WorkoutForm({ target, onDone }: { target: WorkoutTarget; onDone: () => void }) {
  const [kind, setKind] = useState<"plan" | "log">(
    target.mode === "new" ? target.prefer : target.mode,
  );
  // Shared between the two forms, so switching Plan ↔ Log keeps what you typed.
  const [type, setType] = useState<WorkoutType>(
    target.mode === "plan" ? target.plan.type : target.mode === "log" ? target.log.type : "strength",
  );
  const [title, setTitle] = useState(target.mode === "plan" ? target.plan.title : target.mode === "log" ? target.log.title : "");

  const common = { type, setType, title, setTitle, onDone };
  if (target.mode === "plan") return <PlanForm plan={target.plan} occurrence={target.occurrence} {...common} />;
  if (target.mode === "log") return <LogForm log={target.log} {...common} />;

  const switcher = (
    <Segmented
      name="kind"
      value={kind}
      onChange={setKind}
      options={[
        { value: "plan", label: "Weekly plan" },
        { value: "log", label: "Log workout" },
      ]}
    />
  );
  return kind === "plan" ? (
    <PlanForm plan={null} draft={target} switcher={switcher} occurrence={null} {...common} />
  ) : (
    <LogForm log={null} draft={target} switcher={switcher} {...common} />
  );
}

type Common = {
  type: WorkoutType;
  setType: (t: WorkoutType) => void;
  title: string;
  setTitle: (t: string) => void;
  onDone: () => void;
  switcher?: ReactNode;
};
type Draft = Extract<WorkoutTarget, { mode: "new" }>;

function TitleAndType({ type, setType, title, setTitle, placeholder }: Common & { placeholder: string }) {
  const uid = useId();
  return (
    <>
      <Segmented name="type" value={type} onChange={setType} options={TYPE_OPTIONS} />
      <Field label="Title" htmlFor={`${uid}-title`}>
        <Input
          id={`${uid}-title`}
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
          required
          maxLength={80}
          autoFocus
        />
      </Field>
    </>
  );
}

/** Confirm-before-delete row used by both forms. */
function DeleteConfirm({ what, pending, onCancel, onConfirm }: { what: string; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="grid gap-3 rounded-xl border border-down/30 bg-down-soft/50 p-3">
      <p className="text-[13px] text-ink-2">{what} This can&apos;t be undone.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Keep it
        </Button>
        <Button className="bg-down text-white hover:bg-down/90" disabled={pending} onClick={onConfirm}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

function PlanForm({
  plan,
  draft,
  occurrence,
  ...common
}: Common & { plan: PlanLite | null; draft?: Draft; occurrence: { dateKey: string; canMarkDone: boolean } | null }) {
  const uid = useId();
  const { title, onDone, switcher } = common;
  const save = useAction(saveWorkoutPlan, onDone);
  const remove = useAction(deleteWorkoutPlan, onDone);
  const markDone = useAction(saveWorkoutLog, onDone);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [day, setDay] = useState(plan?.dayOfWeek ?? draft?.dayOfWeek ?? 0);
  const start = plan?.startMin ?? draft?.startMin ?? 7 * 60;
  const duration = plan?.durationMin ?? draft?.durationMin ?? 30;

  const logOccurrence = () => {
    if (!plan || !occurrence) return;
    const fd = new FormData();
    fd.set("date", occurrence.dateKey);
    fd.set("time", minutesLabel(plan.startMin));
    fd.set("type", plan.type);
    fd.set("title", plan.title);
    fd.set("durationMin", String(plan.durationMin));
    fd.set("scheduleId", String(plan.id));
    markDone.run(fd);
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
    >
      {switcher}
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <TitleAndType {...common} placeholder="e.g. Pushups, Upper body" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Every" htmlFor={`${uid}-day`}>
          <Select id={`${uid}-day`} name="dayOfWeek" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {WEEKDAYS_SHORT.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start" htmlFor={`${uid}-time`}>
          <Input id={`${uid}-time`} name="time" type="time" step={60} defaultValue={minutesLabel(start)} required className="tabular" />
        </Field>
        <Field label="Minutes" htmlFor={`${uid}-dur`}>
          <Input id={`${uid}-dur`} name="durationMin" type="number" min={5} max={600} defaultValue={duration} required className="tabular" />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">Repeats every {WEEKDAYS_LONG[day]}. Changing it changes every week.</p>

      {plan && occurrence?.canMarkDone && (
        <Button variant="secondary" onClick={logOccurrence} disabled={markDone.pending}>
          <Check className="size-4" />
          {markDone.pending ? "Logging…" : `Mark done for ${dayLabel(occurrence.dateKey, plan.dayOfWeek)}`}
        </Button>
      )}

      <FormError error={save.error ?? remove.error ?? markDone.error} />
      {plan && confirmDelete && (
        <DeleteConfirm
          what={`Delete the weekly plan "${plan.title}"? Sessions you already logged for it stay.`}
          pending={remove.pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => remove.run(plan.id)}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        {plan && !confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.pending || !title.trim()}>
            {save.pending ? "Saving…" : plan ? "Save" : "Add plan"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function LogForm({ log, draft, ...common }: Common & { log: WorkoutLogDetail | null; draft?: Draft }) {
  const uid = useId();
  const tz = useViewerTz();
  const { onDone, switcher, title } = common;
  const save = useAction(saveWorkoutLog, onDone);
  const remove = useAction(deleteWorkoutLog, onDone);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = format(nowIn(tz), "yyyy-MM-dd");

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
    >
      {switcher}
      {log && <input type="hidden" name="id" value={log.id} />}
      <TitleAndType {...common} placeholder="e.g. Upper body" />
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
        <Field label="Date" htmlFor={`${uid}-date`}>
          <Input id={`${uid}-date`} name="date" type="date" max={today} defaultValue={log?.dateKey ?? draft?.dateKey ?? today} required />
        </Field>
        <Field label="Start" htmlFor={`${uid}-time`}>
          <Input
            id={`${uid}-time`}
            name="time"
            type="time"
            step={60}
            defaultValue={minutesLabel(log?.startMin ?? draft?.startMin ?? 7 * 60)}
            required
            className="tabular"
          />
        </Field>
        <Field label="Minutes" htmlFor={`${uid}-dur`}>
          <Input
            id={`${uid}-dur`}
            name="durationMin"
            type="number"
            min={1}
            max={600}
            defaultValue={log?.durationMin ?? draft?.durationMin ?? 45}
            required
            className="tabular"
          />
        </Field>
      </div>
      <Field label="Exercises (optional)" htmlFor={`${uid}-ex`} hint="One per line, e.g. “Bench press 4x8 60kg” or “Plank”.">
        <Textarea
          id={`${uid}-ex`}
          name="exercises"
          className="min-h-20"
          defaultValue={log?.exercisesText}
          placeholder={"Pushup 4x15\nPlank"}
        />
      </Field>
      <Field label="Notes (optional)" htmlFor={`${uid}-notes`}>
        <Input id={`${uid}-notes`} name="notes" maxLength={500} defaultValue={log?.notes ?? ""} />
      </Field>

      <FormError error={save.error ?? remove.error} />
      {log && confirmDelete && (
        <DeleteConfirm
          what={`Delete "${log.title}"?`}
          pending={remove.pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => remove.run(log.id)}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        {log && !confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.pending || !title.trim()}>
            {save.pending ? "Saving…" : log ? "Save" : "Save workout"}
          </Button>
        </div>
      </div>
    </form>
  );
}
