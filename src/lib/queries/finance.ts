import "server-only";
import { and, asc, desc, eq, gte, lt, or, sql, type SQL } from "drizzle-orm";
import { addMonths, format, startOfMonth } from "date-fns";
import { db } from "@/db";
import { ADJUSTMENT_TITLE, budgets, categories, transactions, transfers, wallets, type TxType } from "@/db/schema";
import { countAll, localPart, sumOf } from "@/db/sql";
import { MONTHS_LONG, MONTHS_SHORT, dateIn, monthKey, timeAgo, weekdayIndex, zoned } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import type { Viewer } from "@/lib/viewer";
import { getWallets } from "./wallets";

export type TxView = {
  id: number;
  type: TxType;
  amount: number;
  title: string;
  note: string | null;
  categoryId: number | null;
  categoryName: string;
  icon: string;
  walletId: number | null;
  walletName: string;
  source: "manual" | "email";
  dateISO: string;
  dateLabel: string;
  ago: string;
};

/** The viewer's transactions joined with category and wallet names. */
function txQuery(v: Viewer, ...conds: (SQL | undefined)[]) {
  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      title: transactions.title,
      note: transactions.note,
      date: transactions.date,
      source: transactions.source,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      icon: categories.icon,
      walletId: transactions.walletId,
      walletName: wallets.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(wallets, eq(transactions.walletId, wallets.id))
    .where(and(eq(transactions.userId, v.id), ...conds));
}

type TxRow = Awaited<ReturnType<typeof txQuery>>[number];

function toView(r: TxRow, tz: string): TxView {
  const adjustment = r.categoryId === null && r.title === ADJUSTMENT_TITLE;
  return {
    id: r.id,
    type: r.type,
    amount: r.amount,
    title: r.title,
    note: r.note,
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? (adjustment ? ADJUSTMENT_TITLE : "Uncategorized"),
    icon: r.icon ?? (adjustment ? "scale" : "circle"),
    walletId: r.walletId,
    walletName: r.walletName ?? "No wallet",
    source: r.source,
    dateISO: r.date.toISOString(),
    dateLabel: format(zoned(r.date, tz), "d MMM yyyy, HH:mm"),
    ago: timeAgo(r.date),
  };
}

export function getCategories(v: Viewer) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, v.id))
    .orderBy(asc(categories.type), asc(categories.name));
}

/** Categories with how many transactions use each (for the category manager). */
export async function getCategoryUsage(v: Viewer) {
  const rows = await db
    .select({ categoryId: transactions.categoryId, count: countAll() })
    .from(transactions)
    .where(eq(transactions.userId, v.id))
    .groupBy(transactions.categoryId);
  return Object.fromEntries(rows.filter((r) => r.categoryId !== null).map((r) => [r.categoryId, r.count])) as Record<
    number,
    number
  >;
}

/** Spending card: this month vs budget, plus the top categories. */
export async function getSpending(v: Viewer, now: Date) {
  const start = startOfMonth(now);
  const prevStart = addMonths(start, -1);

  const [rows, budget] = await Promise.all([
    db
      .select({
        categoryId: transactions.categoryId,
        name: categories.name,
        icon: categories.icon,
        // gte() maps the date through the column (a raw ${start} would hand postgres-js a TZDate).
        isCurrent: sql<boolean>`${gte(transactions.date, start)}`,
        total: sumOf(transactions.amount),
        count: countAll(),
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(eq(transactions.userId, v.id), eq(transactions.type, "expense"), gte(transactions.date, prevStart)))
      .groupBy(transactions.categoryId, categories.name, categories.icon, sql`4`),
    db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, v.id), eq(budgets.month, monthKey(now))))
      .limit(1),
  ]);

  const byCat = new Map<number | null, { name: string; icon: string; amount: number; count: number; prev: number }>();
  for (const r of rows) {
    const entry = byCat.get(r.categoryId) ?? {
      name: r.name ?? "Uncategorized",
      icon: r.icon ?? "circle",
      amount: 0,
      count: 0,
      prev: 0,
    };
    if (r.isCurrent) {
      entry.amount += r.total;
      entry.count += r.count;
    } else entry.prev += r.total;
    byCat.set(r.categoryId, entry);
  }

  const cats = [...byCat.values()];
  const spent = cats.reduce((s, c) => s + c.amount, 0);
  const prevSpent = cats.reduce((s, c) => s + c.prev, 0);
  const txCount = cats.reduce((s, c) => s + c.count, 0);
  const top = cats
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((c) => ({ ...c, change: pctChange(c.amount, c.prev) }));

  return {
    monthLabel: `${MONTHS_LONG[now.getMonth()]} ${now.getFullYear()}`,
    spent,
    prevSpent,
    txCount,
    budget: budget[0]?.amount ?? 0,
    top,
  };
}

/** Cash-flow card: income vs expense per month for a year (optionally one wallet). */
export async function getCashFlow(
  v: Viewer,
  year: number,
  categoryId: number | null,
  walletId: number | null,
  now: Date,
) {
  const from = dateIn(v.tz, year, 0, 1);
  const to = dateIn(v.tz, year + 1, 0, 1);
  const filters = [eq(transactions.userId, v.id), gte(transactions.date, from), lt(transactions.date, to)];
  if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
  if (walletId) filters.push(eq(transactions.walletId, walletId));

  const [rows, w, yearRows] = await Promise.all([
    db
      .select({
        month: localPart(transactions.date, v.tz, "MM"),
        type: transactions.type,
        total: sumOf(transactions.amount),
      })
      .from(transactions)
      .where(and(...filters))
      .groupBy(sql`1`, transactions.type),
    getWallets(v, now),
    db
      .selectDistinct({ y: localPart(transactions.date, v.tz, "YYYY") })
      .from(transactions)
      .where(eq(transactions.userId, v.id)),
  ]);

  const lastMonth = year === now.getFullYear() ? now.getMonth() : year < now.getFullYear() ? 11 : -1;
  const months = Array.from({ length: Math.max(lastMonth + 1, 0) }, (_, m) => ({
    key: m,
    x: MONTHS_SHORT[m],
    label: `${MONTHS_LONG[m]} ${year}`,
    income: 0 as number | null,
    expense: 0 as number | null,
  }));
  for (const r of rows) {
    const m = Number.parseInt(r.month, 10) - 1;
    if (months[m]) months[m][r.type] = (months[m][r.type] ?? 0) + r.total;
  }

  // Balance = net worth (or one wallet), incl. opening balances and transfers.
  const wallet = walletId ? w.wallets.find((x) => x.id === walletId) : undefined;
  const balance = wallet ? wallet.balance : w.netWorth;
  const balanceChange = wallet ? wallet.change : w.netWorthChange;
  // Cash = wallets only, Stocks = stock holdings only (Net · Cash · Stocks switch).
  const cashBalance = wallet ? wallet.balance : w.cashWorth;
  const cashBalanceChange = wallet ? wallet.change : w.cashWorthChange;
  // Net this month = income − expense (transfers are internal moves, not cash flow).
  const netThisMonth = wallet
    ? wallet.monthIncome - wallet.monthExpense
    : w.wallets.reduce((s, x) => s + x.monthIncome - x.monthExpense, 0);

  const years = yearRows.map((r) => Number(r.y)).filter(Boolean);
  if (!years.includes(now.getFullYear())) years.push(now.getFullYear());

  return {
    months,
    balance,
    balanceChange,
    cashBalance,
    cashBalanceChange,
    stockBalance: w.stockWorth,
    stockBalanceChange: w.stockWorthChange,
    hasStocks: w.stocks.length > 0,
    netThisMonth,
    years: years.sort((a, b) => b - a),
  };
}

/**
 * Income vs expense per year (in the viewer's timezone), from the first year with
 * data, or 4 years back if that's later, up to this year. Years before any data
 * are null so the chart shows no dots there.
 */
export async function getYearlyCashFlow(v: Viewer, categoryId: number | null, walletId: number | null, now: Date) {
  const filters = [eq(transactions.userId, v.id)];
  if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
  if (walletId) filters.push(eq(transactions.walletId, walletId));

  const rows = await db
    .select({
      year: localPart(transactions.date, v.tz, "YYYY"),
      type: transactions.type,
      total: sumOf(transactions.amount),
    })
    .from(transactions)
    .where(and(...filters))
    .groupBy(sql`1`, transactions.type);

  const current = now.getFullYear();
  const years = rows.map((r) => Number(r.year)).filter((y) => y > 0 && y <= current);
  const firstData = years.length ? Math.min(...years) : current;
  const from = Math.min(firstData, current - 4);

  return Array.from({ length: current - from + 1 }, (_, i) => {
    const year = from + i;
    const hasData = year >= firstData;
    const sum = (type: TxType) => rows.find((r) => Number(r.year) === year && r.type === type)?.total ?? 0;
    return {
      key: year,
      x: String(year),
      label: String(year),
      income: hasData ? sum("income") : null,
      expense: hasData ? sum("expense") : null,
    };
  });
}

export type ActivityPage = { items: TxView[]; hasMore: boolean };

/** Rows the overview's Recent Activity loads at a time. */
export const ACTIVITY_PAGE_SIZE = 10;

/**
 * One page of income or expenses, newest first. `before` is the last row already shown:
 * the page continues after it (keyset paging, so new rows don't shift or repeat pages).
 */
export async function getActivityPage(
  v: Viewer,
  type: TxType,
  before: { date: Date; id: number } | null = null,
  limit = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  const after = before
    ? or(lt(transactions.date, before.date), and(eq(transactions.date, before.date), lt(transactions.id, before.id)))
    : undefined;
  const rows = await txQuery(v, eq(transactions.type, type), after)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit).map((r) => toView(r, v.tz)), hasMore: rows.length > limit };
}

/** The first page of expenses and of income, for the overview. */
export async function getRecentActivity(v: Viewer) {
  const [outgoing, incoming] = await Promise.all([getActivityPage(v, "expense"), getActivityPage(v, "income")]);
  return { outgoing, incoming };
}

/** Everything the Money page shows for one month (month is 0-based). */
export async function getMonthDetail(v: Viewer, year: number, month: number, walletId: number | null = null) {
  const start = dateIn(v.tz, year, month, 1);
  const end = dateIn(v.tz, year, month + 1, 1);
  const prevStart = dateIn(v.tz, year, month - 1, 1);
  const inWallet = walletId ? [eq(transactions.walletId, walletId)] : [];
  const key = monthKey(start);

  // Transfers in/out of the selected wallet this month (only meaningful for one wallet).
  const moved = async (col: typeof transfers.fromWalletId | typeof transfers.toWalletId) =>
    walletId
      ? ((
          await db
            .select({ total: sumOf(transfers.amount) })
            .from(transfers)
            .where(and(eq(transfers.userId, v.id), eq(col, walletId), gte(transfers.date, start), lt(transfers.date, end)))
        )[0]?.total ?? 0)
      : 0;

  const [rows, prev, transfersIn, transfersOut, budget] = await Promise.all([
    txQuery(v, gte(transactions.date, start), lt(transactions.date, end), ...inWallet).orderBy(desc(transactions.date)),
    db
      .select({ type: transactions.type, total: sumOf(transactions.amount) })
      .from(transactions)
      .where(and(eq(transactions.userId, v.id), gte(transactions.date, prevStart), lt(transactions.date, start), ...inWallet))
      .groupBy(transactions.type),
    moved(transfers.toWalletId),
    moved(transfers.fromWalletId),
    db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, v.id), eq(budgets.month, key)))
      .limit(1),
  ]);

  const views = rows.map((r) => toView(r, v.tz));
  const income = views.filter((t) => t.type === "income");
  const expense = views.filter((t) => t.type === "expense");
  const incomeTotal = income.reduce((s, t) => s + t.amount, 0);
  const expenseTotal = expense.reduce((s, t) => s + t.amount, 0);

  const cats = new Map<string, { name: string; icon: string; amount: number; count: number }>();
  for (const t of expense) {
    const c = cats.get(t.categoryName) ?? { name: t.categoryName, icon: t.icon, amount: 0, count: 0 };
    c.amount += t.amount;
    c.count += 1;
    cats.set(t.categoryName, c);
  }
  const byCategory = [...cats.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((c) => ({ ...c, share: expenseTotal ? c.amount / expenseTotal : 0 }));

  return {
    key,
    label: `${MONTHS_LONG[month]} ${year}`,
    income,
    expense,
    incomeTotal,
    expenseTotal,
    prevIncomeTotal: prev.find((p) => p.type === "income")?.total ?? 0,
    prevExpenseTotal: prev.find((p) => p.type === "expense")?.total ?? 0,
    transfersIn,
    transfersOut,
    budget: budget[0]?.amount ?? 0,
    byCategory,
  };
}

export type MonthDetail = Awaited<ReturnType<typeof getMonthDetail>>;

/** Income vs expense per day of one month (0-based). Future days are null so the lines stop at today. */
export async function getDailyCashFlow(
  v: Viewer,
  year: number,
  month: number,
  categoryId: number | null,
  walletId: number | null,
  now: Date,
) {
  const start = dateIn(v.tz, year, month, 1);
  const end = dateIn(v.tz, year, month + 1, 1);
  const filters = [eq(transactions.userId, v.id), gte(transactions.date, start), lt(transactions.date, end)];
  if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
  if (walletId) filters.push(eq(transactions.walletId, walletId));

  const rows = await db
    .select({
      day: localPart(transactions.date, v.tz, "DD"),
      type: transactions.type,
      total: sumOf(transactions.amount),
    })
    .from(transactions)
    .where(and(...filters))
    .groupBy(sql`1`, transactions.type);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lastDay =
    year === now.getFullYear() && month === now.getMonth() ? now.getDate() : start > now ? 0 : daysInMonth;

  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const future = d > lastDay;
    const sum = (type: TxType) => rows.find((r) => Number(r.day) === d && r.type === type)?.total ?? 0;
    return {
      key: i,
      x: String(d),
      label: format(dateIn(v.tz, year, month, d), "EEEE, d MMMM yyyy"),
      income: future ? null : sum("income"),
      expense: future ? null : sum("expense"),
    };
  });
}

/**
 * Income vs expense per week (Monday–Sunday) of one month (0-based), clipped to the month.
 * Weeks that haven't started yet are null so the lines stop at this week.
 */
export async function getWeeklyCashFlow(
  v: Viewer,
  year: number,
  month: number,
  categoryId: number | null,
  walletId: number | null,
  now: Date,
) {
  const days = await getDailyCashFlow(v, year, month, categoryId, walletId, now);
  const monthName = format(dateIn(v.tz, year, month, 1), "MMMM yyyy");
  const weeks: { first: number; last: number; income: number | null; expense: number | null }[] = [];
  for (const [i, d] of days.entries()) {
    const day = i + 1;
    // getDay(): 0 = Sunday; a new week starts on Monday (and on the 1st).
    if (day === 1 || dateIn(v.tz, year, month, day).getDay() === 1) weeks.push({ first: day, last: day, income: null, expense: null });
    const w = weeks[weeks.length - 1];
    w.last = day;
    if (d.income !== null) w.income = (w.income ?? 0) + d.income;
    if (d.expense !== null) w.expense = (w.expense ?? 0) + d.expense;
  }
  return weeks.map((w, i) => ({
    key: i,
    x: w.first === w.last ? String(w.first) : `${w.first}–${w.last}`,
    label: `${w.first === w.last ? w.first : `${w.first}–${w.last}`} ${monthName}`,
    income: w.income,
    expense: w.expense,
  }));
}

/** Index of the week containing `day` in getWeeklyCashFlow's result. */
export function weekIndexOf(tz: string, year: number, month: number, day: number): number {
  let index = 0;
  for (let d = 2; d <= day; d++) if (dateIn(tz, year, month, d).getDay() === 1) index++;
  return index;
}

export type CashDay = {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  /** After today: nothing to show yet. */
  future: boolean;
  income: number;
  expense: number;
  /** income − expense */
  net: number;
  /** At least one transaction that day. */
  hasActivity: boolean;
  label: string;
  /** That day's transactions, newest first (empty outside the month). */
  transactions: TxView[];
};

/**
 * One month as a Monday-first calendar of daily gain/loss (income − spending).
 * Transfers between your own wallets don't count, as in the other cash-flow views.
 */
export async function getDailyCalendar(
  v: Viewer,
  year: number,
  month: number,
  categoryId: number | null,
  walletId: number | null,
  now: Date,
) {
  const first = dateIn(v.tz, year, month, 1);
  const conds = [gte(transactions.date, first), lt(transactions.date, dateIn(v.tz, year, month + 1, 1))];
  if (categoryId) conds.push(eq(transactions.categoryId, categoryId));
  if (walletId) conds.push(eq(transactions.walletId, walletId));
  const [days, rows] = await Promise.all([
    getDailyCashFlow(v, year, month, categoryId, walletId, now),
    txQuery(v, ...conds).orderBy(desc(transactions.date)),
  ]);
  // The month's transactions grouped by local day of the month.
  const byDay = new Map<number, TxView[]>();
  for (const r of rows) {
    const d = zoned(r.date, v.tz).getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), toView(r, v.tz)]);
  }

  const lead = weekdayIndex(first);
  const cells = Math.ceil((lead + days.length) / 7) * 7;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const grid: CashDay[] = Array.from({ length: cells }, (_, i) => {
    const d = dateIn(v.tz, year, month, 1 - lead + i);
    const point = days[i - lead];
    const income = point?.income ?? 0;
    const expense = point?.expense ?? 0;
    const dayOfMonth = i - lead + 1;
    return {
      key: format(d, "yyyy-MM-dd"),
      day: d.getDate(),
      inMonth: Boolean(point),
      isToday: isCurrentMonth && dayOfMonth === now.getDate(),
      future: Boolean(point) && point.income === null,
      income,
      expense,
      net: income - expense,
      hasActivity: Boolean(point) && (byDay.get(dayOfMonth)?.length ?? 0) > 0,
      label: format(d, "EEEE, d MMMM yyyy"),
      transactions: point ? (byDay.get(dayOfMonth) ?? []) : [],
    };
  });

  const income = days.reduce((s, d) => s + (d.income ?? 0), 0);
  const expense = days.reduce((s, d) => s + (d.expense ?? 0), 0);
  return {
    key: monthKey(first),
    label: format(first, "MMMM yyyy"),
    isCurrentMonth,
    days: grid,
    income,
    expense,
    net: income - expense,
  };
}

export type DailyCalendar = Awaited<ReturnType<typeof getDailyCalendar>>;
