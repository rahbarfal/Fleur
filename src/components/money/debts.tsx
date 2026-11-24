"use client";

import { CreditCard, HandCoins, Pencil, Receipt, Repeat, type LucideIcon } from "lucide-react";
import type { DebtKind } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/format";
import type { DebtView } from "@/lib/queries/debts";
import { WorthAmount } from "./worth-eye";

const DEBT_ICON: Record<DebtKind, LucideIcon> = {
  credit_card: CreditCard,
  online_credit: HandCoins,
  subscription: Repeat,
  other: Receipt,
};

/** Due within this many days: shown in red. */
const SOON_DAYS = 3;

export function DebtIcon({ kind, active = false }: { kind: DebtKind; active?: boolean }) {
  const Icon = DEBT_ICON[kind];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition",
        active ? "bg-ink text-white" : "border border-line bg-soft text-ink-2",
      )}
    >
      <Icon className="size-4" strokeWidth={1.8} />
    </span>
  );
}

/** Full amount, or "Rp4,3jt" when its container is narrower than `below` px (needs an `@container` parent). */
function FitAmount({ value, below }: { value: number; below: 150 | 215 }) {
  // Literal class names so Tailwind finds them.
  const [full, compact] =
    below === 150 ? ["@max-[150px]:hidden", "hidden @max-[150px]:inline"] : ["@max-[215px]:hidden", "hidden @max-[215px]:inline"];
  return (
    <>
      <span className={full}>{formatIDR(value)}</span>
      <span className={compact} title={formatIDR(value)}>
        {formatIDRCompact(value)}
      </span>
    </>
  );
}

const paidOff = (d: DebtView) => d.kind !== "subscription" && d.amount === 0;
const perCycle = (d: DebtView) => (d.cycle === "yearly" ? "/yr" : "/mo");

/** "Due in 2 days" · "Renews 3 Dec" · "Paid off" (null when there's no due day). */
function dueText(d: DebtView, long = false): string | null {
  if (paidOff(d)) return "Paid off";
  if (d.dueIn === null || d.dueLabel === null || d.dueShort === null) return null;
  const verb = d.kind === "subscription" ? "Renews" : "Due";
  if (d.dueIn === 0) return `${verb} today`;
  if (d.dueIn === 1) return `${verb} tomorrow`;
  if (long) return `${verb} ${d.dueLabel} · in ${d.dueIn} days`;
  if (d.dueIn <= SOON_DAYS) return `${verb} in ${d.dueIn} days`;
  return `${verb} ${d.dueShort}`;
}

const isSoon = (d: DebtView) => !paidOff(d) && d.dueIn !== null && d.dueIn <= SOON_DAYS;

/** Second line of a row: its key number (the icon already shows the kind). */
function detail(d: DebtView): string {
  if (d.kind === "subscription") return d.cycle === "yearly" ? "Yearly" : "Monthly";
  if (d.used !== null) return `${Math.round(d.used * 100)}% of limit`;
  if (d.installment) return `${formatIDRCompact(d.installment)}/mo`;
  return d.kindLabel;
}

const rowClass = (selected: boolean) =>
  cn(
    "flex h-14 w-full items-center gap-3 rounded-xl border px-3 text-left transition focus-visible:outline-2 focus-visible:outline-accent",
    selected ? "border-ink bg-soft" : "border-line hover:border-faint",
  );

export function DebtRow({ d, selected, onSelect }: { d: DebtView; selected: boolean; onSelect: () => void }) {
  const due = dueText(d);
  return (
    <li className="shrink-0">
      <button type="button" onClick={onSelect} aria-pressed={selected} title={selected ? "Show all" : `${d.name} · ${d.kindLabel}`} className={rowClass(selected)}>
        <DebtIcon kind={d.kind} active={selected} />
        <span className="@container min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{d.name}</span>
            <span className={cn("shrink-0 text-[14px] font-semibold tabular", paidOff(d) && "text-muted")}>
              <FitAmount value={d.amount} below={150} />
              {d.kind === "subscription" && <span className="text-[12px] font-normal text-muted">{perCycle(d)}</span>}
            </span>
          </span>
          <span className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate text-muted">{detail(d)}</span>
            {due && <span className={cn("shrink-0", isSoon(d) ? "font-medium text-down" : paidOff(d) ? "text-up" : "text-muted")}>{due}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** "Owed Rp 4.500.000 · Rp 250.000/mo" above the Debts list. Not part of net worth. */
export function DebtSummary({ owed, monthly }: { owed: number; monthly: number }) {
  return (
    <div className="@container -mt-1 mb-2 shrink-0">
      <p
        className="flex items-baseline justify-between gap-2 text-[12px] text-muted"
        title="Tracked apart from your wallets: not counted in net worth"
      >
        <span className="truncate">
          Owed{" "}
          <span className="font-semibold text-ink tabular">
            <FitAmount value={owed} below={215} />
          </span>
        </span>
        {monthly > 0 && (
          <span className="shrink-0" title="Subscriptions and installments per month">
            <span className="font-semibold text-ink tabular">
              <FitAmount value={monthly} below={215} />
            </span>
            /mo
          </span>
        )}
      </p>
    </div>
  );
}

/** The dark block at the top of the Wallets card while a debt is selected. */
export function DebtHeader({
  d,
  worth,
  onEdit,
  onBack,
}: {
  d: DebtView;
  worth: number;
  onEdit: () => void;
  onBack: () => void;
}) {
  const due = dueText(d, true);
  const facts: string[] = [];
  if (d.creditLimit) facts.push(`${Math.round((d.used ?? 0) * 100)}% of ${formatIDR(d.creditLimit)} limit`);
  if (d.installment && d.kind !== "subscription") facts.push(`${formatIDR(d.installment)}/mo`);
  if (d.monthsLeft) facts.push(`≈ ${formatNumber(d.monthsLeft)} month${d.monthsLeft === 1 ? "" : "s"} left`);
  if (d.kind === "subscription" && d.cycle === "yearly" && d.monthly) facts.push(`≈ ${formatIDR(d.monthly)}/mo`);
  if (d.note) facts.push(d.note);

  return (
    <div className="shrink-0 rounded-xl bg-ink px-3.5 py-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] text-white/70">
          {d.name} · {d.kindLabel}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-6 items-center gap-1 rounded-md bg-white/10 px-2 text-[12px] transition hover:bg-white/20"
        >
          <Pencil className="size-3" /> Edit
        </button>
      </div>
      <span className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className="text-[22px] font-semibold leading-tight tracking-tight tabular">
          {formatIDR(d.amount)}
          {d.kind === "subscription" && <span className="text-[14px] font-normal text-white/70">{perCycle(d)}</span>}
        </span>
        {due && (
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-medium",
              isSoon(d) ? "bg-down-soft text-down" : "bg-white/10 text-white/80",
            )}
          >
            {due}
          </span>
        )}
      </span>
      {d.used !== null && (
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <span
            className={cn("block h-full rounded-full", d.used > 0.9 ? "bg-down" : "bg-white")}
            style={{ width: `${Math.round(Math.min(1, d.used) * 100)}%` }}
          />
        </span>
      )}
      {facts.length > 0 && <span className="mt-1 block truncate text-[12px] text-white/70">{facts.join(" · ")}</span>}
      <button type="button" onClick={onBack} className="mt-1 text-[12px] text-white/70 transition hover:text-white">
        ← All · <WorthAmount value={worth} />
      </button>
    </div>
  );
}
