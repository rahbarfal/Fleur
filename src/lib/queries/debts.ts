import "server-only";
import { format, startOfDay } from "date-fns";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debts } from "@/db/schema";
import { DEBT_KIND_LABEL, DEBT_KINDS, type DebtCycle, type DebtKind } from "@/lib/constants";
import { dateIn } from "@/lib/dates";
import type { Viewer } from "@/lib/viewer";

/*
 * Debts (credit cards, online credit, subscriptions…) for Money → Wallets → Debts.
 * They're informational: nothing here touches wallet balances or net worth.
 */

export type DebtView = {
  id: number;
  name: string;
  kind: DebtKind;
  kindLabel: string;
  /** Owed now; for a subscription, its price per cycle. */
  amount: number;
  creditLimit: number | null;
  installment: number | null;
  cycle: DebtCycle;
  dueDay: number | null;
  dueMonth: number | null;
  note: string | null;
  /** Share of the credit limit in use (0–1, can pass 1), when there's a limit. */
  used: number | null;
  /** What it costs per month: a subscription's price (yearly ÷ 12) or the installment. */
  monthly: number | null;
  /** Installments left at the current installment (rounded up). */
  monthsLeft: number | null;
  /** Next due / renewal date, e.g. "25 Nov" or "15 Mar 2027" (null without a due day). */
  dueLabel: string | null;
  /** The same without the year, for tight rows. */
  dueShort: string | null;
  /** Days from today until then (0 = today). */
  dueIn: number | null;
};

export type DebtsSummary = {
  debts: DebtView[];
  /** Everything owed (all but subscriptions). */
  debtOwed: number;
  /** Subscriptions + installments, per month. */
  debtMonthly: number;
};

/** Days in a calendar month (month 0-based; independent of timezone). */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Next time a day-of-month (monthly) or month + day (yearly) comes round, today included. */
function nextDue(now: Date, tz: string, cycle: DebtCycle, day: number, month: number | null) {
  const today = startOfDay(now);
  const at = (y: number, m: number) => {
    const yy = y + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    return dateIn(tz, yy, mm, Math.min(day, daysIn(yy, mm)));
  };
  const y = now.getFullYear();
  let due: Date;
  if (cycle === "yearly" && month !== null) {
    due = at(y, month - 1);
    if (due < today) due = at(y + 1, month - 1);
  } else {
    due = at(y, now.getMonth());
    if (due < today) due = at(y, now.getMonth() + 1);
  }
  // Rounded: a DST change makes a day 23 or 25 hours long.
  const dueIn = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const short = format(due, "d MMM");
  return { dueIn, short, label: due.getFullYear() === y ? short : format(due, "d MMM yyyy") };
}

export async function getDebts(v: Viewer, now: Date): Promise<DebtsSummary> {
  const rows = await db
    .select()
    .from(debts)
    .where(eq(debts.userId, v.id))
    .orderBy(asc(debts.sortOrder), asc(debts.id));

  const views = rows.map((d): DebtView => {
    const sub = d.kind === "subscription";
    const due = d.dueDay ? nextDue(now, v.tz, d.cycle, d.dueDay, d.dueMonth) : null;
    return {
      id: d.id,
      name: d.name,
      kind: d.kind,
      kindLabel: DEBT_KIND_LABEL[d.kind],
      amount: d.amount,
      creditLimit: d.creditLimit,
      installment: d.installment,
      cycle: d.cycle,
      dueDay: d.dueDay,
      dueMonth: d.dueMonth,
      note: d.note,
      used: !sub && d.creditLimit ? d.amount / d.creditLimit : null,
      monthly: sub ? (d.cycle === "yearly" ? Math.round(d.amount / 12) : d.amount) : d.installment,
      monthsLeft: !sub && d.installment && d.amount > 0 ? Math.ceil(d.amount / d.installment) : null,
      dueLabel: due?.label ?? null,
      dueShort: due?.short ?? null,
      dueIn: due?.dueIn ?? null,
    };
  });
  // Grouped by kind (cards, online credit, subscriptions, other), then in the order added.
  views.sort((a, b) => DEBT_KINDS.indexOf(a.kind) - DEBT_KINDS.indexOf(b.kind));

  return {
    debts: views,
    debtOwed: views.reduce((s, d) => s + (d.kind === "subscription" ? 0 : d.amount), 0),
    // A paid-off debt's installment no longer costs anything.
    debtMonthly: views.reduce((s, d) => s + (d.kind !== "subscription" && d.amount === 0 ? 0 : (d.monthly ?? 0)), 0),
  };
}
