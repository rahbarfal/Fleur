"use client";

import { ArrowLeftRight, MoreHorizontal, Pencil, Plus, Wallet as WalletGlyph } from "lucide-react";
import { useState } from "react";
import { deleteTransfer } from "@/app/actions/wallets";
import type { Category } from "@/db/schema";
import { cn } from "@/lib/cn";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/format";
import type { DebtView } from "@/lib/queries/debts";
import type { StockHoldingView } from "@/lib/queries/stocks";
import type { TransferView, WalletView } from "@/lib/queries/wallets";
import { CardShell } from "@/components/dashboard/card-shell";
import { worthItems, type WorthItem } from "@/components/dashboard/finance-cards";
import { DebtDialog } from "@/components/forms/debt-dialog";
import { TransactionDialog, WalletDialog } from "@/components/forms/finance-dialogs";
import { StockDialog } from "@/components/forms/stock-dialog";
import { Pager } from "@/components/ui/pager";
import { EmptyState, IconButton, ToggleGroup, TrendBadge } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { useFitCount, usePaged } from "@/components/ui/use-fit";
import { useSearchParamSetter } from "@/components/ui/use-search-param";
import { useWorthMode, type WorthMode } from "@/components/ui/use-stored-state";
import { DebtHeader, DebtRow, DebtSummary } from "./debts";
import { WorthAmount, WorthEye } from "./worth-eye";
import { SHADES, StockIcon, WalletIcon } from "./wallet-icon";
import { WorthToggle } from "./worth-toggle";

/** "12 lot × Rp 9.875" (or why there's no price) for a stock. */
function stockLine(h: StockHoldingView): string {
  const lots = `${formatNumber(h.lots)} lot`;
  if (h.price === null) return `${lots} · price unavailable`;
  return `${lots} × ${formatIDR(h.price)}${h.stale ? " (last known)" : ""}`;
}

/** Stacked bar of how the shown net worth is spread across wallets and/or stocks. */
export function AllocationBar({ items, className }: { items: WorthItem[]; className?: string }) {
  const positive = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  const parts = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (!parts.length || !positive) return null;
  return (
    <div className={cn("flex h-2 w-full gap-0.5 overflow-hidden rounded-full", className)} aria-hidden>
      {parts.map((p, i) => (
        <span
          key={p.key}
          title={`${p.name}: ${Math.round((p.value / positive) * 100)}%`}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(p.value / positive) * 100}%`, background: SHADES[Math.min(i, SHADES.length - 1)] }}
        />
      ))}
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <span className={cn("shrink-0 tabular", value > 0 ? "text-up" : "text-down")} title="Change this month">
      {value > 0 ? "+" : ""}
      {formatIDRCompact(value)}
    </span>
  );
}

const rowClass = (selected: boolean) =>
  cn(
    "flex h-14 w-full items-center gap-3 rounded-xl border px-3 text-left transition focus-visible:outline-2 focus-visible:outline-accent",
    selected ? "border-ink bg-soft" : "border-line hover:border-faint",
  );

function WalletRow({ w, selected, onSelect }: { w: WalletView; selected: boolean; onSelect: () => void }) {
  return (
    <li className="shrink-0">
      <button type="button" onClick={onSelect} aria-pressed={selected} title={selected ? "Show all wallets" : `Show only ${w.name}`} className={rowClass(selected)}>
        <WalletIcon type={w.type} active={selected} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{w.name}</span>
            <span className={cn("shrink-0 text-[14px] font-semibold tabular", w.balance < 0 && "text-down")}>{formatIDR(w.balance)}</span>
          </span>
          <span className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate text-muted">
              {w.typeLabel} · {Math.round(w.share * 100)}%
            </span>
            <Delta value={w.balance - w.monthStartBalance} />
          </span>
        </span>
      </button>
    </li>
  );
}

function StockRow({ h, selected, onSelect }: { h: StockHoldingView; selected: boolean; onSelect: () => void }) {
  return (
    <li className="shrink-0">
      <button type="button" onClick={onSelect} aria-pressed={selected} title={selected ? "Show all" : `Show ${h.symbol}`} className={rowClass(selected)}>
        <StockIcon active={selected} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{h.symbol}</span>
            <span className="shrink-0 text-[14px] font-semibold tabular">{formatIDR(h.value)}</span>
          </span>
          <span className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate text-muted">
              {h.company} · {stockLine(h)}
            </span>
            <Delta value={h.value - h.monthStartValue} />
          </span>
        </span>
      </button>
    </li>
  );
}

function TransferRow({ t, walletId }: { t: TransferView; walletId: number | null }) {
  const remove = useAction(deleteTransfer);
  const dir = walletId === null ? 0 : t.toId === walletId ? 1 : -1;
  return (
    <li className={cn("flex h-14 shrink-0 items-center gap-3 rounded-xl border border-line px-3", remove.pending && "opacity-40")}>
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-soft text-ink-2" aria-hidden>
        <ArrowLeftRight className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-ink">
          {t.fromName} <span className="text-muted">→</span> {t.toName}
        </p>
        <p className="truncate text-[12px] text-muted">
          {t.note ? `${t.note} · ` : ""}
          <span title={t.ago}>{t.dateLabel}</span>
        </p>
      </div>
      <p className={cn("shrink-0 text-[14px] font-semibold tabular", dir === 1 && "text-up")}>
        {dir === 1 ? "+" : dir === -1 ? "−" : ""}
        {formatIDR(t.amount)}
      </p>
      <button
        type="button"
        aria-label={`Delete transfer ${t.fromName} to ${t.toName}`}
        title="Delete"
        className="rounded p-0.5 text-faint transition hover:bg-soft hover:text-down focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => {
          if (confirm(`Delete transfer ${t.fromName} → ${t.toName} (${formatIDR(t.amount)})?`)) remove.run(t.id);
        }}
      >
        <MoreHorizontal className="size-4" />
      </button>
    </li>
  );
}

type Tab = "wallets" | "stocks" | "debts" | "transfers";

export function WalletsCard({
  wallets,
  stocks,
  netWorth,
  netWorthChange,
  cashWorth,
  cashWorthChange,
  stockWorth,
  stockWorthChange,
  debts,
  debtOwed,
  debtMonthly,
  transfers,
  selectedId,
  categories,
  className,
}: {
  wallets: WalletView[];
  stocks: StockHoldingView[];
  /** Wallets + stocks. */
  netWorth: number;
  netWorthChange: number | null;
  cashWorth: number;
  cashWorthChange: number | null;
  stockWorth: number;
  stockWorthChange: number | null;
  /** Credit cards, online credit, subscriptions: not part of net worth. */
  debts: DebtView[];
  debtOwed: number;
  debtMonthly: number;
  transfers: TransferView[];
  selectedId: number | null;
  categories: Category[];
  className?: string;
}) {
  const { set, pending } = useSearchParamSetter();
  const [tab, setTab] = useState<Tab>("wallets");
  const [editing, setEditing] = useState<WalletView | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [stockEditing, setStockEditing] = useState<StockHoldingView | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [debtEditing, setDebtEditing] = useState<DebtView | null>(null);
  const [debtOpen, setDebtOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<number | null>(null);

  const [ref, count] = useFitCount<HTMLUListElement>(56, 8, 6);
  const walletPage = usePaged(wallets, count);
  const stockPage = usePaged(stocks, count);
  const debtPage = usePaged(debts, count);
  const transferPage = usePaged(transfers, count);
  const p = tab === "wallets" ? walletPage : tab === "stocks" ? stockPage : tab === "debts" ? debtPage : transferPage;
  const selected = wallets.find((w) => w.id === selectedId) ?? null;
  const selectedStock = stocks.find((h) => h.id === selectedStockId) ?? null;
  const selectedDebt = debts.find((d) => d.id === selectedDebtId) ?? null;
  const [worthMode, setWorthMode] = useWorthMode();
  const hasStocks = stocks.length > 0;
  // Without stocks there's nothing to switch: Net = Cash.
  const mode: WorthMode = hasStocks ? worthMode : "net";
  const worth = mode === "cash" ? cashWorth : mode === "stocks" ? stockWorth : netWorth;
  const worthChange = mode === "cash" ? cashWorthChange : mode === "stocks" ? stockWorthChange : netWorthChange;

  const openWallet = (w: WalletView | null) => {
    setEditing(w);
    setWalletOpen(true);
  };
  const openStock = (h: StockHoldingView | null) => {
    setStockEditing(h);
    setStockOpen(true);
  };
  const openDebt = (d: DebtView | null) => {
    setDebtEditing(d);
    setDebtOpen(true);
  };
  const selectWallet = (id: number | null) => {
    setSelectedStockId(null);
    setSelectedDebtId(null);
    set("wallet", id === null ? null : String(id));
  };
  const selectStock = (id: number | null) => {
    setSelectedStockId(id);
    setSelectedDebtId(null);
    if (id !== null && selectedId !== null) set("wallet", null);
  };
  const selectDebt = (id: number | null) => {
    setSelectedDebtId(id);
    setSelectedStockId(null);
    if (id !== null && selectedId !== null) set("wallet", null);
  };

  return (
    <CardShell
      icon={<WalletGlyph />}
      title="Wallets"
      className={className}
      actions={
        <>
          <IconButton label="Transfer between wallets" onClick={() => setTransferOpen(true)} disabled={wallets.length < 2}>
            <ArrowLeftRight className="size-3.5" />
          </IconButton>
          {tab === "stocks" ? (
            <IconButton label="Add stock" onClick={() => openStock(null)}>
              <Plus className="size-4" />
            </IconButton>
          ) : tab === "debts" ? (
            <IconButton label="Add debt" onClick={() => openDebt(null)}>
              <Plus className="size-4" />
            </IconButton>
          ) : (
            <IconButton label="Add wallet" onClick={() => openWallet(null)}>
              <Plus className="size-4" />
            </IconButton>
          )}
        </>
      }
    >
      {selectedDebt ? (
        <DebtHeader d={selectedDebt} worth={worth} onEdit={() => openDebt(selectedDebt)} onBack={() => selectDebt(null)} />
      ) : selectedStock ? (
        <div className="shrink-0 rounded-xl bg-ink px-3.5 py-3 text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-white/70">
              {selectedStock.symbol} · {selectedStock.company}
            </span>
            <button
              type="button"
              onClick={() => openStock(selectedStock)}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-white/10 px-2 text-[12px] transition hover:bg-white/20"
            >
              <Pencil className="size-3" /> Edit
            </button>
          </div>
          <span className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[22px] font-semibold leading-tight tracking-tight tabular">{formatIDR(selectedStock.value)}</span>
            <TrendBadge value={selectedStock.change} />
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-white/70">
            {formatNumber(selectedStock.shares)} shares · {stockLine(selectedStock)}
            {selectedStock.asOfLabel && ` · ${selectedStock.asOfLabel}`}
          </span>
          <button type="button" onClick={() => selectStock(null)} className="mt-1 text-[12px] text-white/70 transition hover:text-white">
            ← All · <WorthAmount value={worth} />
          </button>
        </div>
      ) : selected ? (
        <div className={cn("shrink-0 rounded-xl bg-ink px-3.5 py-3 text-white", pending && "opacity-70")}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-white/70">
              {selected.name} · {selected.typeLabel}
            </span>
            <button
              type="button"
              onClick={() => openWallet(selected)}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-white/10 px-2 text-[12px] transition hover:bg-white/20"
            >
              <Pencil className="size-3" /> Edit
            </button>
          </div>
          <span className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[22px] font-semibold leading-tight tracking-tight tabular">{formatIDR(selected.balance)}</span>
            <TrendBadge value={selected.change} />
          </span>
          <button type="button" onClick={() => selectWallet(null)} className="mt-1 text-[12px] text-white/70 transition hover:text-white">
            ← All wallets · <WorthAmount value={worth} />
          </button>
        </div>
      ) : (
        <div className={cn("shrink-0 rounded-xl bg-ink px-3.5 py-3 text-white", pending && "opacity-70")}>
          {hasStocks && <WorthToggle tone="dark" value={mode} onChange={setWorthMode} />}
          <span className={cn("flex flex-wrap items-center gap-2", hasStocks && "mt-1.5")}>
            <span className="text-[22px] font-semibold leading-tight tracking-tight tabular">
              <WorthAmount value={worth} />
            </span>
            <WorthEye tone="dark" />
            <TrendBadge value={worthChange} />
          </span>
        </div>
      )}
      <AllocationBar items={worthItems(wallets, stocks, mode)} className="mt-3 shrink-0" />

      {/* Four tabs share a narrow card: they fill its width, and the text shrinks (then scrolls) on small screens. */}
      <div className="@container mb-3 mt-3 shrink-0">
        <ToggleGroup
          label="Wallet view"
          className="flex w-full overflow-x-auto [scrollbar-width:none]"
          buttonClassName="flex-[1_0_auto] whitespace-nowrap px-1 @max-[227px]:text-[12px] @max-[213px]:px-0.5 @max-[213px]:text-[11.5px]"
          value={tab}
          onChange={(t) => {
            setTab(t);
            p.setPage(0);
          }}
          options={[
            { value: "wallets", label: "Wallets" },
            { value: "stocks", label: "Stocks" },
            { value: "debts", label: "Debts" },
            { value: "transfers", label: "Transfers" },
          ]}
        />
        {tab === "transfers" && selected && <p className="mt-1.5 truncate text-[12px] text-muted">{selected.name} only</p>}
      </div>
      {tab === "debts" && debts.length > 0 && <DebtSummary owed={debtOwed} monthly={debtMonthly} />}

      <ul ref={ref} className="flex flex-col gap-2 overflow-hidden fit:min-h-0 fit:flex-1">
        {tab === "wallets" ? (
          wallets.length ? (
            walletPage.pageItems.map((w) => (
              <WalletRow key={w.id} w={w} selected={w.id === selectedId} onSelect={() => selectWallet(w.id === selectedId ? null : w.id)} />
            ))
          ) : (
            <EmptyState>Add your first wallet.</EmptyState>
          )
        ) : tab === "stocks" ? (
          stocks.length ? (
            stockPage.pageItems.map((h) => (
              <StockRow
                key={h.id}
                h={h}
                selected={h.id === selectedStockId}
                onSelect={() => selectStock(h.id === selectedStockId ? null : h.id)}
              />
            ))
          ) : (
            <EmptyState>No stocks yet. Add BBCA or BBRI with +.</EmptyState>
          )
        ) : tab === "debts" ? (
          debts.length ? (
            debtPage.pageItems.map((d) => (
              <DebtRow key={d.id} d={d} selected={d.id === selectedDebtId} onSelect={() => selectDebt(d.id === selectedDebtId ? null : d.id)} />
            ))
          ) : (
            <EmptyState>Add a credit card, online credit or subscription with +. Debts don&apos;t change your net worth.</EmptyState>
          )
        ) : transfers.length ? (
          transferPage.pageItems.map((t) => <TransferRow key={t.id} t={t} walletId={selectedId} />)
        ) : (
          <EmptyState>No transfers yet.</EmptyState>
        )}
      </ul>
      <Pager {...p} noun={tab} />

      <WalletDialog open={walletOpen} onOpenChange={setWalletOpen} wallet={editing} />
      <DebtDialog open={debtOpen} onOpenChange={setDebtOpen} debt={debtEditing} />
      <StockDialog open={stockOpen} onOpenChange={setStockOpen} stock={stockEditing} taken={stocks.map((h) => h.symbol)} />
      <TransactionDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        categories={categories}
        wallets={wallets}
        defaultType="transfer"
        defaultWalletId={selectedId}
      />
    </CardShell>
  );
}
