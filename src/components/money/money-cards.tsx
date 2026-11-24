"use client";

import { ArrowDownLeft, ArrowUpRight, BarChart3, Plus, Tags, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Category } from "@/db/schema";
import type { TxType } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatIDR, formatIDRCompact, pctChange } from "@/lib/format";
import type { DailyCalendar, MonthDetail } from "@/lib/queries/finance";
import { CashCalendar } from "./cash-calendar";
import { CashFlowChart, type CashFlowPoint } from "@/components/charts/cash-flow-chart";
import { CardShell } from "@/components/dashboard/card-shell";
import { CashFlowFilters, ChartLegend, type CashFlowData } from "@/components/dashboard/finance-cards";
import { CategoriesDialog } from "@/components/forms/category-dialog";
import { TransactionDialog, type WalletLite } from "@/components/forms/finance-dialogs";
import { CategoryIcon } from "@/components/ui/category-icon";
import {
  EmptyState,
  IconButton,
  MonthStepper,
  PillSelect,
  StatusDot,
  ToggleGroup,
  TrendText,
} from "@/components/ui/primitives";
import { useFitCount } from "@/components/ui/use-fit";
import { useSearchParamSetter } from "@/components/ui/use-search-param";
import { useWorthMode } from "@/components/ui/use-stored-state";
import { WorthAmount, WorthEye } from "./worth-eye";
import { PagedTxList, type TxSort } from "./tx-list";

type Summary = Omit<MonthDetail, "income" | "expense" | "byCategory">;

function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 px-2.5 first:pl-0">
      <p className="truncate text-[12px] text-muted">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold leading-tight tracking-tight tabular">{children}</p>
      {sub && <div className="mt-0.5 truncate text-[12px] text-muted short:hidden">{sub}</div>}
    </div>
  );
}

/** Colour key for the Daily calendar. */
function GainLossLegend() {
  return (
    <div className="flex items-center gap-3 text-[12px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] border border-up/30 bg-up-soft" /> Gain
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] border border-down/30 bg-down-soft" /> Loss
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ Chart with month details */

export function CashFlowDetailCard({
  data,
  year,
  categoryId,
  categories,
  selectedMonth,
  summary,
  view,
  weekly,
  daily,
  yearly,
  monthsInYear,
  todayKey,
  currentKey,
  wallet,
  className,
}: {
  data: CashFlowData;
  year: number;
  categoryId: number | null;
  categories: Category[];
  selectedMonth: number;
  summary: Summary;
  /** "monthly" = the year by month; "weekly" / "daily" = the selected month by week / as a gain-loss calendar; "yearly" = one point per year. */
  view: "monthly" | "weekly" | "daily" | "yearly";
  weekly: CashFlowPoint[];
  daily: DailyCalendar | null;
  yearly: CashFlowPoint[];
  /** Months of `year` so far (12 for past years), for the yearly average. */
  monthsInYear: number;
  /** Index of this week in `weekly` when the selected month is the current one. */
  todayKey?: number;
  /** "YYYY-MM" of the current month (from the server), to stop the stepper at today. */
  currentKey: string;
  /** The wallet the page is filtered to, if any. */
  wallet: WalletLite | null;
  className?: string;
}) {
  const { set, setMany, pending } = useSearchParamSetter();
  // Follows the Net · Cash · Stocks switch on the Wallets card (only for the all-wallets view).
  const [worthMode] = useWorthMode();
  const mode = !wallet && data.hasStocks ? worthMode : "net";
  const shownWorth = mode === "cash" ? data.cashBalance : mode === "stocks" ? data.stockBalance : data.balance;
  const net = summary.incomeTotal - summary.expenseTotal;
  const prevNet = summary.prevIncomeTotal - summary.prevExpenseTotal;
  const used = summary.budget ? summary.expenseTotal / summary.budget : 0;
  const savingsRate = summary.incomeTotal ? (net / summary.incomeTotal) * 100 : null;
  const moved = summary.transfersIn - summary.transfersOut;

  // Yearly view: the stats describe the selected year instead of the month.
  const yearPoint = (y: number) => yearly.find((p) => p.key === y);
  const yIncome = yearPoint(year)?.income ?? 0;
  const yExpense = yearPoint(year)?.expense ?? 0;
  const yPrevIncome = yearPoint(year - 1)?.income ?? 0;
  const yPrevExpense = yearPoint(year - 1)?.expense ?? 0;
  const yNet = yIncome - yExpense;
  const ySavings = yIncome ? (yNet / yIncome) * 100 : null;

  const stepMonth = (delta: number) => {
    const [y, m] = summary.key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMany({ year: String(d.getFullYear()), month: key });
  };

  return (
    <CardShell
      icon={<BarChart3 />}
      title="Cash Flow"
      className={className}
      actions={
        <>
          {wallet && (
            <button
              type="button"
              onClick={() => set("wallet", null)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink pl-3 pr-2 text-[13px] font-medium text-white transition hover:bg-ink-2"
              title="Show all wallets"
            >
              {wallet.name}
              <X className="size-3.5 opacity-70" />
            </button>
          )}
          {view === "monthly" && (
            <PillSelect aria-label="Year" value={year} onChange={(e) => setMany({ year: e.target.value, month: null })}>
              {data.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </PillSelect>
          )}
          <ToggleGroup
            label="Chart period"
            value={view}
            onChange={(v) => set("view", v === "daily" ? null : v)}
            options={[
              { value: "yearly", label: "Yearly" },
              { value: "monthly", label: "Monthly" },
              { value: "weekly", label: "Weekly" },
              { value: "daily", label: "Daily" },
            ]}
          />
        </>
      }
    >
      <div className={cn("flex flex-col transition-opacity fit:min-h-0 fit:flex-1", pending && "opacity-50")}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="flex min-w-0 items-baseline gap-2.5">
            <span className="text-[24px] font-semibold leading-none tracking-tight tabular">
              <WorthAmount value={shownWorth} />
            </span>
            <WorthEye className="self-center" />
            <span className="truncate text-[13px] text-muted">
              {wallet ? `${wallet.name} balance` : mode === "cash" ? "cash" : mode === "stocks" ? "stocks" : "net worth"}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {view === "weekly" || view === "daily" ? (
              <MonthStepper
                label={summary.label}
                onPrev={() => stepMonth(-1)}
                onNext={() => stepMonth(1)}
                nextDisabled={summary.key >= currentKey}
              />
            ) : (
              <p className="text-[13px] font-medium text-ink">{view === "yearly" ? year : summary.label}</p>
            )}
          </div>
        </div>

        {view === "yearly" ? (
          <div className="mt-3 grid shrink-0 grid-cols-2 gap-y-3 rounded-xl bg-soft px-4 py-3 short:py-2 sm:grid-cols-4 sm:divide-x sm:divide-line">
            <Stat label={`Income ${year}`} sub={<TrendText value={pctChange(yIncome, yPrevIncome)} />}>
              {formatIDR(yIncome)}
            </Stat>
            <Stat label={`Expenses ${year}`} sub={<TrendText value={pctChange(yExpense, yPrevExpense)} invert />}>
              {formatIDR(yExpense)}
            </Stat>
            <Stat
              label="Net"
              sub={
                <span className="flex items-center gap-1.5">
                  <StatusDot ok={yNet >= 0} className="size-3" />
                  {ySavings === null ? "no income" : `${Math.round(ySavings)}% kept`}
                </span>
              }
            >
              <span className={yNet >= 0 ? "text-up" : "text-down"}>{formatIDR(yNet)}</span>
            </Stat>
            <Stat label="Avg spend / month" sub={`over ${monthsInYear} month${monthsInYear === 1 ? "" : "s"}`}>
              {formatIDR(Math.round(yExpense / Math.max(1, monthsInYear)))}
            </Stat>
          </div>
        ) : (
        <div className="mt-3 grid shrink-0 grid-cols-2 gap-y-3 rounded-xl bg-soft px-4 py-3 short:py-2 sm:grid-cols-4 sm:divide-x sm:divide-line">
          <Stat label="Income" sub={<TrendText value={pctChange(summary.incomeTotal, summary.prevIncomeTotal)} />}>
            {formatIDR(summary.incomeTotal)}
          </Stat>
          <Stat label="Expenses" sub={<TrendText value={pctChange(summary.expenseTotal, summary.prevExpenseTotal)} invert />}>
            {formatIDR(summary.expenseTotal)}
          </Stat>
          <Stat
            label="Net"
            sub={
              <span className="flex items-center gap-1.5" title={`Last month: ${formatIDR(prevNet)}`}>
                <StatusDot ok={net >= 0} className="size-3" />
                {savingsRate === null ? "no income yet" : `${Math.round(savingsRate)}% kept`}
              </span>
            }
          >
            <span className={net >= 0 ? "text-up" : "text-down"}>{formatIDR(net)}</span>
          </Stat>
          {wallet ? (
            <Stat
              label="Transfers"
              sub={`in ${formatIDRCompact(summary.transfersIn)} · out ${formatIDRCompact(summary.transfersOut)}`}
            >
              <span className={moved >= 0 ? "text-ink" : "text-down"}>
                {moved > 0 ? "+" : ""}
                {formatIDR(moved)}
              </span>
            </Stat>
          ) : (
            <Stat
              label="Budget used"
              sub={
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
                  <span
                    className={cn("block h-full rounded-full", used > 1 ? "bg-down" : "bg-ink")}
                    style={{ width: `${Math.min(100, used * 100)}%` }}
                  />
                </span>
              }
            >
              {summary.budget ? `${Math.round(used * 100)}%` : "—"}
              {summary.budget > 0 && (
                <span className="ml-1 text-[12px] font-normal text-muted">of {formatIDRCompact(summary.budget)}</span>
              )}
            </Stat>
          )}
        </div>
        )}

        <div className="mt-2.5 flex shrink-0 items-center justify-between gap-2">
          {view === "daily" ? <GainLossLegend /> : <ChartLegend />}
          <CashFlowFilters
            years={[]}
            year={year}
            categoryId={categoryId}
            categories={categories}
            onChange={(key, value) => set(key, value)}
            categoryOnly
          />
        </div>
        <div className="mt-1 fit:min-h-0 fit:flex-1">
          {view === "daily" && daily ? (
            <CashCalendar days={daily.days} />
          ) : view === "weekly" ? (
            <CashFlowChart data={weekly} selectedKey={todayKey} label="Weekly income and expense line chart" />
          ) : view === "yearly" ? (
            <CashFlowChart
              data={yearly}
              selectedKey={year}
              onSelect={(y) => setMany({ year: String(y), month: null })}
              label="Yearly income and expense line chart"
            />
          ) : (
            <CashFlowChart
              data={data.months}
              selectedKey={selectedMonth}
              onSelect={(m) => set("month", `${year}-${String(m + 1).padStart(2, "0")}`)}
            />
          )}
        </div>
      </div>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Category breakdown */

function CategoryBreakdown({ items }: { items: MonthDetail["byCategory"] }) {
  const [ref, count] = useFitCount<HTMLUListElement>(44, 10, 7);
  // Fold whatever doesn't fit into "Others".
  const shown = items.length > count ? items.slice(0, Math.max(1, count - 1)) : items;
  const rest = items.slice(shown.length);
  const rows = rest.length
    ? [
        ...shown,
        {
          name: `Others (${rest.length})`,
          icon: "circle",
          amount: rest.reduce((s, c) => s + c.amount, 0),
          count: rest.reduce((s, c) => s + c.count, 0),
          share: rest.reduce((s, c) => s + c.share, 0),
        },
      ]
    : shown;

  if (items.length === 0) return <EmptyState>No spending this month.</EmptyState>;
  return (
    <ul ref={ref} className="flex flex-col gap-2.5 overflow-hidden fit:min-h-0 fit:flex-1">
      {rows.map((c, i) => (
        <li key={c.name} className="flex h-11 shrink-0 items-center gap-3">
          <CategoryIcon name={c.icon} className="size-8 [&>svg]:size-4" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate text-ink">
                {c.name} <span className="text-muted">· {c.count} tx</span>
              </span>
              <span className="shrink-0 font-medium tabular">{formatIDR(c.amount)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft">
                <span
                  className={cn("block h-full rounded-full", i === 0 ? "bg-ink" : i === 1 ? "bg-[#8e8f93]" : "bg-[#c9cacd]")}
                  style={{ width: `${Math.max(2, c.share * 100)}%` }}
                />
              </span>
              <span className="w-9 shrink-0 text-right text-[11px] text-muted tabular">{Math.round(c.share * 100)}%</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Income / expense lists */

export function TxListCard({
  type,
  items,
  total,
  monthLabel,
  categories,
  wallets,
  walletId,
  byCategory,
  categoryUsage,
  className,
}: {
  type: TxType;
  items: MonthDetail["income"];
  total: number;
  monthLabel: string;
  categories: Category[];
  wallets: WalletLite[];
  /** Filtered wallet: preselected when adding, and hidden from row details. */
  walletId: number | null;
  /** Expenses only: enables the List | Categories toggle. */
  byCategory?: MonthDetail["byCategory"];
  /** Transactions per category id, for the category manager. */
  categoryUsage: Record<number, number>;
  className?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [sort, setSort] = useState<TxSort>("latest");
  const [tab, setTab] = useState<"list" | "categories">("list");
  const income = type === "income";
  const showCategories = !!byCategory && tab === "categories";

  return (
    <CardShell
      icon={income ? <ArrowDownLeft /> : <ArrowUpRight />}
      title={income ? "Income" : "Expenses"}
      className={className}
      actions={
        <>
          {byCategory && (
            <ToggleGroup
              label="Expenses view"
              value={tab}
              onChange={setTab}
              options={[
                { value: "list", label: "List" },
                { value: "categories", label: "Categories" },
              ]}
            />
          )}
          {!showCategories && (
            <PillSelect aria-label="Sort by amount" value={sort} onChange={(e) => setSort(e.target.value as TxSort)}>
              <option value="latest">Latest</option>
              <option value="desc">Amount ↓</option>
              <option value="asc">Amount ↑</option>
            </PillSelect>
          )}
          {(income || showCategories) && (
            <IconButton label={`Manage ${income ? "income" : "expense"} categories`} onClick={() => setCatsOpen(true)}>
              <Tags className="size-3.5" />
            </IconButton>
          )}
          <IconButton label={income ? "Add income" : "Add expense"} onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
          </IconButton>
        </>
      }
    >
      <p className="mb-2 flex shrink-0 items-baseline justify-between gap-2 leading-tight">
        <span className={cn("text-[18px] font-semibold tracking-tight tabular", income ? "text-up" : "text-ink")}>
          {income ? "+" : ""}
          {formatIDR(total)}
        </span>
        <span className="truncate text-[12px] text-muted">{monthLabel}</span>
      </p>
      {showCategories ? (
        <CategoryBreakdown items={byCategory} />
      ) : (
        <PagedTxList
          key={sort}
          items={items}
          sort={sort}
          showWallet={walletId === null}
          empty={income ? "No income this month." : "No expenses this month."}
          noun={income ? "entries" : "expenses"}
        />
      )}
      <TransactionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        wallets={wallets}
        defaultType={type}
        defaultWalletId={walletId}
      />
      <CategoriesDialog
        open={catsOpen}
        onOpenChange={setCatsOpen}
        categories={categories}
        usage={categoryUsage}
        defaultType={type}
      />
    </CardShell>
  );
}
