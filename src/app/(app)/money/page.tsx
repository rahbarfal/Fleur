import type { Metadata } from "next";
import { PageGrid } from "@/components/dashboard/card-shell";
import { CashFlowDetailCard, TxListCard } from "@/components/money/money-cards";
import { StocksCard } from "@/components/money/stocks-card";
import { WalletsCard } from "@/components/money/wallets-card";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { monthKey, nowIn } from "@/lib/dates";
import {
  getCashFlow,
  getCategories,
  getCategoryUsage,
  getDailyCalendar,
  getWeeklyCashFlow,
  weekIndexOf,
  getMonthDetail,
  getYearlyCashFlow,
} from "@/lib/queries/finance";
import { getDebts } from "@/lib/queries/debts";
import { getStocks, STOCK_RANGES, type StockRange } from "@/lib/queries/stocks";
import { getTransfers, getWallets } from "@/lib/queries/wallets";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Money · Fleur" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `?month=2026-03` if it belongs to `year`, else the current month (or December for past years). */
function pickMonth(raw: unknown, year: number, now: Date): number {
  const m = typeof raw === "string" ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  if (m && Number(m[1]) === year) {
    const idx = Number(m[2]) - 1;
    // Never a month after this one (the calendar and stepper stop at today).
    if (idx >= 0 && idx < 12) return year === now.getFullYear() ? Math.min(idx, now.getMonth()) : idx;
  }
  return year === now.getFullYear() ? now.getMonth() : 11;
}

export default async function MoneyPage({ searchParams }: { searchParams: SearchParams }) {
  const [v, sp] = await Promise.all([requireViewer(), searchParams]);
  const now = nowIn(v.tz);
  const year = Math.min(Number(sp.year) || now.getFullYear(), now.getFullYear());
  const categoryId = Number(sp.cat) || null;
  const month = pickMonth(sp.month, year, now);
  const range: StockRange = STOCK_RANGES.includes(sp.range as StockRange) ? (sp.range as StockRange) : "1mo";
  const view = sp.view === "weekly" || sp.view === "monthly" || sp.view === "yearly" ? sp.view : "daily";
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // The wallet filter only applies if it's one of the viewer's wallets.
  const { wallets, stocks, netWorth, netWorthChange, cashWorth, cashWorthChange, stockWorth, stockWorthChange } = await getWallets(v, now);
  const selected = wallets.find((w) => w.id === Number(sp.wallet)) ?? null;
  const walletId = selected?.id ?? null;

  const [categories, categoryUsage, detail, transfers, cashFlow, weekly, daily, yearly, quotes, debtSummary] = await Promise.all([
    getCategories(v),
    getCategoryUsage(v),
    getMonthDetail(v, year, month, walletId),
    getTransfers(v, walletId),
    getCashFlow(v, year, categoryId, walletId, now),
    view === "weekly" ? getWeeklyCashFlow(v, year, month, categoryId, walletId, now) : [],
    view === "daily" ? getDailyCalendar(v, year, month, categoryId, walletId, now) : null,
    view === "yearly" ? getYearlyCashFlow(v, categoryId, walletId, now) : [],
    getStocks(range, v.tz),
    getDebts(v, now),
  ]);
  const { income, expense, byCategory, ...summary } = detail;
  const listLabel = selected ? `${summary.label} · ${selected.name}` : summary.label;

  return (
    <PageGrid className="fit:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {stocks.length > 0 && <AutoRefresh minutes={5} />}
      <WalletsCard
        className="fit:col-span-3 fit:row-span-2"
        wallets={wallets}
        stocks={stocks}
        netWorth={netWorth}
        netWorthChange={netWorthChange}
        cashWorth={cashWorth}
        cashWorthChange={cashWorthChange}
        stockWorth={stockWorth}
        stockWorthChange={stockWorthChange}
        debts={debtSummary.debts}
        debtOwed={debtSummary.debtOwed}
        debtMonthly={debtSummary.debtMonthly}
        transfers={transfers}
        selectedId={walletId}
        categories={categories}
      />
      <CashFlowDetailCard
        className="md:col-span-2 fit:col-span-6"
        data={cashFlow}
        year={year}
        categoryId={categoryId}
        categories={categories}
        selectedMonth={month}
        summary={summary}
        view={view}
        weekly={weekly}
        daily={daily}
        yearly={yearly}
        monthsInYear={year === now.getFullYear() ? now.getMonth() + 1 : 12}
        todayKey={isCurrentMonth ? weekIndexOf(v.tz, year, month, now.getDate()) : undefined}
        currentKey={monthKey(now)}
        wallet={selected && { id: selected.id, name: selected.name, type: selected.type }}
      />
      <StocksCard className="fit:col-span-3" quotes={quotes} range={range} />
      <TxListCard
        className="fit:col-span-4"
        type="income"
        items={income}
        total={summary.incomeTotal}
        monthLabel={listLabel}
        categories={categories}
        wallets={wallets}
        walletId={walletId}
        categoryUsage={categoryUsage}
      />
      <TxListCard
        className="fit:col-span-5"
        type="expense"
        items={expense}
        total={summary.expenseTotal}
        monthLabel={listLabel}
        categories={categories}
        wallets={wallets}
        walletId={walletId}
        byCategory={byCategory}
        categoryUsage={categoryUsage}
      />
    </PageGrid>
  );
}
