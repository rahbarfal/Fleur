import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";

export const IconButton = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { label: string }>(
  function IconButton({ className, label, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-ink-2",
          "transition hover:bg-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-ink text-white hover:bg-ink-2",
        variant === "secondary" && "border border-line bg-card text-ink hover:bg-soft",
        variant === "danger" && "text-down hover:bg-down-soft",
        variant === "ghost" && "text-ink-2 hover:bg-soft",
        className,
      )}
      {...props}
    />
  );
}

/** Pill-shaped native select, like the "Daily ⌄" controls in the reference. */
export function PillSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        className={cn(
          "h-8 cursor-pointer appearance-none rounded-lg border border-line bg-card pl-3 pr-8 text-[13px] text-ink-2",
          "transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
    </span>
  );
}

export function TrendBadge({ value, invert = false, className }: { value: number | null; invert?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return null;
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium tabular",
        good ? "bg-up-soft text-up" : "bg-down-soft text-down",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {formatPct(Math.abs(value)).replace("+", "")}
    </span>
  );
}

export function TrendText({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-[13px] text-faint">new</span>;
  const good = invert ? value <= 0 : value >= 0;
  return <span className={cn("text-[13px] font-medium tabular", good ? "text-up" : "text-down")}>{formatPct(value)}</span>;
}

export function StatusDot({ ok, className }: { ok: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-3.5 items-center justify-center rounded-full",
        ok ? "bg-up" : "bg-down",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-white/90" />
    </span>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border border-line bg-card px-3 text-sm text-ink placeholder:text-faint transition focus:border-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputBase, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select className={cn(inputBase, "h-10 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </span>
  );
}

export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-soft p-1">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1.5 text-center text-[13px] font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
            value === o.value ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-down-soft px-3 py-2 text-[13px] text-down">
      {error}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

/** Two or three mutually exclusive options as joined pills (e.g. Monthly | Daily). */
export function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  buttonClassName,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex h-8 items-center gap-0.5 rounded-lg border border-line bg-soft p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            "h-full rounded-md px-2.5 text-[13px] transition focus-visible:outline-2 focus-visible:outline-accent",
            value === o.value ? "bg-card font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
            buttonClassName,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Longest labels: "September" is the longest month; a week across New Year is the longest week. */
const STEPPER_SIZER = { month: "September 2026", week: "28 Dec 2026 – 3 Jan 2027" } as const;

/** ‹ November 2026 › (or a week: unit="week") */
export function MonthStepper({
  label,
  onPrev,
  onNext,
  nextDisabled = false,
  unit = "month",
  sizer = STEPPER_SIZER[unit],
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  unit?: "month" | "week";
  /** The longest label it can show: the label is always this wide, so the arrows never move. */
  sizer?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <IconButton label={`Previous ${unit}`} className="size-7" onClick={onPrev}>
        <ChevronLeft className="size-4" />
      </IconButton>
      {/* One grid cell holding an invisible copy of the longest label and the real one. */}
      <span className="grid whitespace-nowrap px-1 text-center text-[13px] font-medium text-ink tabular">
        <span aria-hidden className="invisible col-start-1 row-start-1">
          {sizer}
        </span>
        <span className="col-start-1 row-start-1">{label}</span>
      </span>
      <IconButton label={`Next ${unit}`} className="size-7" onClick={onNext} disabled={nextDisabled}>
        <ChevronRight className="size-4" />
      </IconButton>
    </div>
  );
}
