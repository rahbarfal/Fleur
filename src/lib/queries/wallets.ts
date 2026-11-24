import "server-only";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { format, startOfMonth } from "date-fns";
import { db } from "@/db";
import { transactions, transfers, wallets } from "@/db/schema";
import { countAll, sumOf, sumWhere } from "@/db/sql";
import { WALLET_TYPE_LABEL, type WalletType } from "@/lib/constants";
import { timeAgo, zoned } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import type { Viewer } from "@/lib/viewer";
import { getStockHoldings, type StockHoldingView } from "./stocks";

export type WalletView = {
  id: number;
  name: string;
  type: WalletType;
  typeLabel: string;
  openingBalance: number;
  balance: number;
  /** Balance at the start of the current month. */
  monthStartBalance: number;
  change: number | null;
  monthIncome: number;
  monthExpense: number;
  txCount: number;
  transferCount: number;
  /** Share of your cash (all wallets; 0–1, only for positive balances). */
  share: number;
};

export type WalletsSummary = {
  /** Money wallets (bank, e-wallet, cash…). */
  wallets: WalletView[];
  /** Stock holdings (BBCA, BBRI), separate from wallets. */
  stocks: StockHoldingView[];
  /** Cash + stocks. */
  netWorth: number;
  netWorthChange: number | null;
  /** Wallets only. */
  cashWorth: number;
  cashWorthChange: number | null;
  /** Stocks only. */
  stockWorth: number;
  stockWorthChange: number | null;
};

/**
 * Every active wallet with its balance (opening + income − expense + transfers in − transfers out),
 * plus your stocks. Deleted (archived) wallets are left out; their transfers still count for the other side.
 */
export async function getWallets(v: Viewer, now: Date): Promise<WalletsSummary> {
  const monthStart = startOfMonth(now);

  const flows = (col: typeof transfers.fromWalletId | typeof transfers.toWalletId) =>
    db
      .select({
        walletId: col,
        total: sumOf(transfers.amount),
        before: sumWhere(transfers.amount, lt(transfers.date, monthStart)),
        count: countAll(),
      })
      .from(transfers)
      .where(eq(transfers.userId, v.id))
      .groupBy(col);

  const [rows, tx, out, inn, stocks] = await Promise.all([
    db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, v.id), isNull(wallets.deletedAt)))
      .orderBy(asc(wallets.sortOrder), asc(wallets.id)),
    db
      .select({
        walletId: transactions.walletId,
        type: transactions.type,
        total: sumOf(transactions.amount),
        before: sumWhere(transactions.amount, lt(transactions.date, monthStart)),
        count: countAll(),
      })
      .from(transactions)
      .where(eq(transactions.userId, v.id))
      .groupBy(transactions.walletId, transactions.type),
    flows(transfers.fromWalletId),
    flows(transfers.toWalletId),
    getStockHoldings(v, now),
  ]);

  const views = rows.map((w): WalletView => {
    const t = (type: "income" | "expense") => tx.find((r) => r.walletId === w.id && r.type === type);
    const inc = t("income");
    const exp = t("expense");
    const o = out.find((r) => r.walletId === w.id);
    const i = inn.find((r) => r.walletId === w.id);
    const balance = w.openingBalance + (inc?.total ?? 0) - (exp?.total ?? 0) + (i?.total ?? 0) - (o?.total ?? 0);
    const monthStartBalance =
      w.openingBalance + (inc?.before ?? 0) - (exp?.before ?? 0) + (i?.before ?? 0) - (o?.before ?? 0);
    return {
      id: w.id,
      name: w.name,
      type: w.type,
      typeLabel: WALLET_TYPE_LABEL[w.type],
      openingBalance: w.openingBalance,
      balance,
      monthStartBalance,
      change: pctChange(balance, monthStartBalance),
      monthIncome: (inc?.total ?? 0) - (inc?.before ?? 0),
      monthExpense: (exp?.total ?? 0) - (exp?.before ?? 0),
      txCount: (inc?.count ?? 0) + (exp?.count ?? 0),
      transferCount: (o?.count ?? 0) + (i?.count ?? 0),
      share: 0,
    };
  });

  const cashWorth = views.reduce((s, w) => s + w.balance, 0);
  const cashStart = views.reduce((s, w) => s + w.monthStartBalance, 0);
  const stockWorth = stocks.reduce((s, h) => s + h.value, 0);
  const stockStart = stocks.reduce((s, h) => s + h.monthStartValue, 0);
  const positive = views.reduce((s, w) => s + Math.max(0, w.balance), 0);
  for (const w of views) w.share = positive ? Math.max(0, w.balance) / positive : 0;
  // Without a month-start price, the stock part of the change is unknown.
  const stockKnown = stocks.every((h) => h.change !== null);

  return {
    wallets: views,
    stocks,
    netWorth: cashWorth + stockWorth,
    netWorthChange: stockKnown ? pctChange(cashWorth + stockWorth, cashStart + stockStart) : null,
    cashWorth,
    cashWorthChange: pctChange(cashWorth, cashStart),
    stockWorth,
    stockWorthChange: stocks.length && stockKnown ? pctChange(stockWorth, stockStart) : null,
  };
}

export type TransferView = {
  id: number;
  fromId: number;
  fromName: string;
  toId: number;
  toName: string;
  amount: number;
  note: string | null;
  dateLabel: string;
  ago: string;
};

/** Transfers, newest first; optionally only those touching one wallet. */
export async function getTransfers(v: Viewer, walletId: number | null = null, limit = 300): Promise<TransferView[]> {
  const from = alias(wallets, "from_wallet");
  const to = alias(wallets, "to_wallet");
  const q = db
    .select({
      id: transfers.id,
      fromId: transfers.fromWalletId,
      fromName: from.name,
      fromDeleted: from.deletedAt,
      toId: transfers.toWalletId,
      toName: to.name,
      toDeleted: to.deletedAt,
      amount: transfers.amount,
      note: transfers.note,
      date: transfers.date,
    })
    .from(transfers)
    .innerJoin(from, eq(transfers.fromWalletId, from.id))
    .innerJoin(to, eq(transfers.toWalletId, to.id));
  const rows = await q
    .where(
      and(
        eq(transfers.userId, v.id),
        walletId ? or(eq(transfers.fromWalletId, walletId), eq(transfers.toWalletId, walletId)) : undefined,
      ),
    )
    .orderBy(desc(transfers.date), desc(transfers.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    fromId: r.fromId,
    fromName: r.fromDeleted ? `${r.fromName} (deleted)` : r.fromName,
    toId: r.toId,
    toName: r.toDeleted ? `${r.toName} (deleted)` : r.toName,
    amount: r.amount,
    note: r.note,
    dateLabel: format(zoned(r.date, v.tz), "d MMM yyyy"),
    ago: timeAgo(r.date),
  }));
}

/** Simple list for selects (id, name, type). */
export function getWalletOptions(v: Viewer) {
  return db
    .select({ id: wallets.id, name: wallets.name, type: wallets.type })
    .from(wallets)
    .where(and(eq(wallets.userId, v.id), isNull(wallets.deletedAt)))
    .orderBy(asc(wallets.sortOrder), asc(wallets.id));
}

export type WalletOption = Awaited<ReturnType<typeof getWalletOptions>>[number];
