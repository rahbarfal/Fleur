"use client";

import Link from "next/link";
import { BarChart3, Gauge, Pencil } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Category } from "@/db/schema";
import { cn } from "@/lib/cn";
import { formatIDR, formatIDRCompact, formatIDRShort } from "@/lib/format";
import type { DailyCalendar } from "@/lib/queries/finance";
import { CashCalendar } from "@/components/money/cash-calendar";
import { CashFlowChart, type CashFlowPoint } from "@/components/charts/cash-flow-chart";
import { SegmentedGauge } from "@/components/charts/segmented-gauge";
import { BudgetDialog } from "@/components/forms/finance-dialogs";
import type { StockHoldingView } from "@/lib/queries/stocks";
import type { WalletView } from "@/lib/queries/wallets";
import type { WalletType } from "@/lib/constants";
import { StockIcon, WalletIcon } from "@/components/money/wallet-icon";
import { EmptyState, IconButton, MonthStepper, PillSelect, StatusDot, ToggleGroup, TrendBadge, TrendText } from "@/components/ui/primitives";
import { useSearchParamSetter } from "@/components/ui/use-search-param";
import { useWorthMode, type WorthMode } from "@/components/ui/use-stored-state";
import { WorthAmount, WorthEye } from "@/components/money/worth-eye";
import { WorthToggle } from "@/components/money/worth-toggle";
import { CardShell, OpenLink } from "./card-shell";

const DOTS = ["bg-ink", "bg-[#d4d4d8]", "bg-[#8e8f93]"];

/* ------------------------------------------------------------------ Spending */

export type SpendingData = {
  monthKey: string;
  monthLabel: string;
  spent: number;
  budget: number;
  txCount: number;
  top: { name: string; icon: string; amount: number; count: number; change: number | null }[];
};

export function SpendingCard({ data, className }: { data: SpendingData; className?: string }) {
  const [budgetOpen, setBudgetOpen] = useState(false);
  const ratio = data.budget ? data.spent / data.budget : 0;
  const over = data.budget > 0 && data.spent > data.budget;

  return (
    <CardShell
      icon={<Gauge />}
      title="Spending"
      className={className}
      actions={
        <>
          <IconButton label="Set monthly budget" onClick={() => setBudgetOpen(true)}>
            <Pencil className="size-3.5" />
          </IconButton>
          <OpenLink href="/money" label="Open Money" />
        </>
      }
    >
      <div className="aspect-[300/160] w-full fit:aspect-auto fit:min-h-[80px] fit:flex-1 short:min-h-[44px]">
        <SegmentedGauge
          fraction={ratio}
          over={over}
          value={formatIDRCompact(data.spent)}
          label={`${Math.round(ratio * 100)}% of monthly budget spent`}
        />
      </div>
      <p className={cn("mt-2 shrink-0 text-center text-[13px]", over ? "text-down" : "text-ink-2")}>
        {data.budget ? `${Math.round(ratio * 100)}% of ${formatIDRCompact(data.budget)} budget` : "No budget set"}
        <span className="text-faint short:hidden"> · {data.txCount} tx</span>
      </p>

      {data.top.length === 0 ? (
        <div className="mt-4">
          <EmptyState>No spending recorded this month.</EmptyState>
        </div>
      ) : (
        <ul className="mt-4 grid shrink-0 gap-3 short:mt-2 short:gap-2">
          {data.top.map((c, i) => (
            <li key={c.name} className="flex items-center justify-between gap-3 short:[&:nth-child(3)]:hidden">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14px] text-ink">
                  <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[i])} />
                  <span className="truncate">{c.name}</span>
                </p>
                <p className="flex gap-3 pl-3.5 text-[12px] text-muted">
                  <span>{c.count} tx</span>
                  <TrendText value={c.change} invert />
                </p>
              </div>
              <p className="shrink-0 text-[14px] font-semibold tabular">{formatIDR(c.amount)}</p>
            </li>
          ))}
        </ul>
      )}

      <BudgetDialog
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
        month={data.monthKey}
        monthLabel={data.monthLabel}
        current={data.budget}
      />
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Cash flow */

export type CashFlowData = {
  months: CashFlowPoint[];
  balance: number;
  balanceChange: number | null;
  /** Wallets only. */
  cashBalance: number;
  cashBalanceChange: number | null;
  /** Stocks only. */
  stockBalance: number;
  stockBalanceChange: number | null;
  /** Whether you hold any stock (otherwise the Net · Cash · Stocks switch is hidden). */
  hasStocks: boolean;
  netThisMonth: number;
  years: number[];
};

export function CashFlowFilters({
  years,
  year,
  categoryId,
  categories,
  onChange,
  categoryOnly = false,
}: {
  years: number[];
  year: number;
  categoryId: number | null;
  categories: Category[];
  onChange: (key: "cat" | "year", value: string | null) => void;
  categoryOnly?: boolean;
}) {
  return (
    <>
      <PillSelect aria-label="Category" value={categoryId ?? ""} onChange={(e) => onChange("cat", e.target.value || null)}>
        <option value="">All Categories</option>
        <optgroup label="Expense">
          {categories
            .filter((c) => c.type === "expense")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
        <optgroup label="Income">
          {categories
            .filter((c) => c.type === "income")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      </PillSelect>
      {!categoryOnly && (
        <PillSelect aria-label="Year" value={year} onChange={(e) => onChange("year", e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </PillSelect>
      )}
    </>
  );
}

export function ChartLegend() {
  return (
    <div className="flex items-center gap-4 text-[13px] text-ink-2">
      <span className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-accent" /> Income
      </span>
      <span className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-[#c9cacd]" /> Expense
      </span>
    </div>
  );
}

/** Wallet chips in one line: as many as fit, then "+N" (each links to the Money page filtered to that wallet). */
/** One chip/segment of net worth: a wallet or a stock. */
export type WorthItem = {
  key: string;
  name: string;
  value: number;
  title: string;
  href: string;
  kind: "wallet" | "stock";
  walletType?: WalletType;
};

/** Wallets and/or stocks for the Net · Cash · Stocks choice, biggest first. */
export function worthItems(wallets: WalletView[], stocks: StockHoldingView[], mode: WorthMode): WorthItem[] {
  const w: WorthItem[] =
    mode === "stocks"
      ? []
      : wallets.map((x) => ({
          key: `w${x.id}`,
          name: x.name,
          value: x.balance,
          title: `${x.name} · ${x.typeLabel}: ${formatIDR(x.balance)}`,
          href: `/money?wallet=${x.id}`,
          kind: "wallet",
          walletType: x.type,
        }));
  const s: WorthItem[] =
    mode === "cash"
      ? []
      : stocks.map((x) => ({
          key: `s${x.id}`,
          name: x.symbol,
          value: x.value,
          title: `${x.symbol} · ${x.lots} lot: ${formatIDR(x.value)}`,
          href: "/money",
          kind: "stock",
        }));
  return [...w, ...s].sort((a, b) => b.value - a.value);
}

export function WorthChips({ items: wallets }: { items: WorthItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // Before measuring (and on the server) every chip is shown; overflow is clipped.
  const [fit, setFit] = useState<{ visible: number; moreLeft: number }>({ visible: wallets.length, moreLeft: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const MORE = 44; // room for the "+N" chip
    const measure = () => {
      const chips = [...el.querySelectorAll<HTMLElement>("[data-chip]")];
      const right = (c: HTMLElement) => c.offsetLeft + c.offsetWidth;
      if (!chips.length || right(chips[chips.length - 1]) <= el.clientWidth) {
        setFit({ visible: chips.length, moreLeft: 0 });
        return;
      }
      let n = 0;
      while (n < chips.length && right(chips[n]) <= el.clientWidth - MORE) n++;
      n = Math.max(1, n);
      setFit({ visible: n, moreLeft: right(chips[n - 1]) + 6 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wallets]);

  const hidden = wallets.length - fit.visible;
  return (
    <div ref={ref} className="relative flex h-7 shrink-0 items-center gap-1.5 overflow-hidden">
      {wallets.map((w, i) => (
        <Link
          key={w.key}
          data-chip
          href={w.href}
          title={w.title}
          aria-hidden={i >= fit.visible || undefined}
          tabIndex={i >= fit.visible ? -1 : undefined}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card pl-1 pr-2.5 text-[12px] transition hover:border-faint",
            i >= fit.visible && "invisible",
          )}
        >
          {w.kind === "stock" ? (
            <StockIcon className="size-5 border-0 [&>svg]:size-3" />
          ) : (
            <WalletIcon type={w.walletType ?? "other"} className="size-5 border-0 [&>svg]:size-3" />
          )}
          <span className="text-ink-2">{w.name}</span>
          <span className={cn("font-medium tabular", w.value < 0 ? "text-down" : "text-ink")}>{formatIDRCompact(w.value)}</span>
        </Link>
      ))}
      {hidden > 0 && (
        <Link
          href="/money"
          title={`${hidden} more`}
          className="absolute top-0 inline-flex h-7 items-center rounded-full bg-soft px-2.5 text-[12px] text-ink-2 hover:bg-line"
          style={{ left: fit.moreLeft }}
        >
          +{hidden}
        </Link>
      )}
    </div>
  );
}

export function CashFlowCard({
  data,
  year,
  view,
  weekly,
  daily,
  yearly,
  todayKey,
  wallets,
  stocks,
  className,
}: {
  data: CashFlowData;
  year: number;
  /** Monthly (year by month), Weekly (this month by week), Daily (a month's gain/loss calendar) or Yearly. */
  view: "monthly" | "weekly" | "daily" | "yearly";
  weekly: CashFlowPoint[];
  /** The calendar month shown in Daily view (`?cfm=`), else null. */
  daily: DailyCalendar | null;
  yearly: CashFlowPoint[];
  todayKey?: number;
  wallets: WalletView[];
  stocks: StockHoldingView[];
  className?: string;
}) {
  const { set, pending } = useSearchParamSetter();
  const [worthMode, setWorthMode] = useWorthMode();
  // Without stocks there's nothing to switch: Net = Cash.
  const mode: WorthMode = data.hasStocks ? worthMode : "net";
  const shown = mode === "cash" ? data.cashBalance : mode === "stocks" ? data.stockBalance : data.balance;
  const shownChange = mode === "cash" ? data.cashBalanceChange : mode === "stocks" ? data.stockBalanceChange : data.balanceChange;
  const stepMonth = (delta: number) => {
    if (!daily) return;
    const [y, m] = daily.key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    // Stepping forward onto the current month drops the parameter (the default).
    set("cfm", delta > 0 && daily.isCurrentMonth ? null : key);
  };
  const moneyHref =
    view === "daily" && daily ? `/money?year=${daily.key.slice(0, 4)}&month=${daily.key}` : `/money?view=${view}`;

  return (
    <CardShell
      icon={<BarChart3 />}
      title="Cash Flow"
      className={className}
      actions={
        <>
          {view === "monthly" && (
            <PillSelect aria-label="Year" value={year} onChange={(e) => set("year", e.target.value)}>
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
            onChange={(v) => set("cf", v === "daily" ? null : v)}
            options={[
              { value: "yearly", label: "Yearly" },
              { value: "monthly", label: "Monthly" },
              { value: "weekly", label: "Weekly" },
              { value: "daily", label: "Daily" },
            ]}
          />
          <OpenLink href={moneyHref} label="Open Money" />
        </>
      }
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular">
          <WorthAmount value={shown} />
        </p>
        <WorthEye />
        <span title="Change since the start of this month">
          <TrendBadge value={shownChange} />
        </span>
        {data.hasStocks && <WorthToggle value={worthMode} onChange={setWorthMode} />}
        <p className="ml-auto flex items-center gap-2 text-[13px] text-ink-2">
          Net this month :
          <span className="font-semibold text-ink tabular">{formatIDR(data.netThisMonth)}</span>
          <StatusDot ok={data.netThisMonth >= 0} />
        </p>
      </div>
      <div className="mt-2.5 short:mt-2">
        <WorthChips items={worthItems(wallets, stocks, mode)} />
      </div>
      {view === "daily" && daily ? (
        <div className="mt-2 flex shrink-0 items-center justify-between gap-2 short:mt-1.5">
          <MonthStepper
            label={daily.label}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            nextDisabled={daily.isCurrentMonth}
          />
          <span className="text-[12px] text-muted">
            Net{" "}
            <span className={cn("font-semibold tabular", daily.net > 0 ? "text-up" : daily.net < 0 ? "text-down" : "text-ink")}>
              {formatIDRShort(daily.net)}
            </span>
          </span>
        </div>
      ) : (
        <div className="mt-2.5 flex shrink-0 items-center justify-between gap-2 short:hidden">
          <ChartLegend />
          <span className="text-[12px] text-muted">{view === "weekly" ? "This month · per week" : view === "yearly" ? "All years · per year" : `${year} · per month`}</span>
        </div>
      )}

      <div className={cn("mt-1 transition-opacity fit:min-h-0 fit:flex-1", pending && "opacity-50")}>
        {view === "daily" && daily ? (
          <CashCalendar days={daily.days} compact />
        ) : view === "weekly" ? (
          <CashFlowChart data={weekly} selectedKey={todayKey} label="Weekly income and expense line chart" />
        ) : view === "yearly" ? (
          <CashFlowChart data={yearly} label="Yearly income and expense line chart" />
        ) : (
          <CashFlowChart data={data.months} />
        )}
      </div>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Recent activity */
