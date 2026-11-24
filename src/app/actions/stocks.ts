"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { stockHoldings, stockWatchlist } from "@/db/schema";
import { STOCK_SYMBOLS } from "@/lib/constants";
import { parseAmount } from "@/lib/format";
import { lookupIdxStock } from "@/lib/queries/stocks";
import { requireViewer } from "@/lib/viewer";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";

const StockInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  /** New holdings only; a holding's ticker never changes. */
  symbol: z.enum(STOCK_SYMBOLS, "Pick a stock").optional(),
  lots: z
    .string()
    .transform((v) => (v.trim() === "" ? Number.NaN : parseAmount(v)))
    .pipe(z.number("Enter how many lots you hold").int().min(0, "Lots can't be negative").max(1_000_000, "That's a lot of lots")),
});

/** Adds a stock you hold (one per ticker) or changes how many lots you hold. */
export async function saveStock(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const raw = formObject(fd);
    const { id, symbol, lots } = StockInput.parse({ ...raw, id: raw.id || undefined, symbol: raw.symbol || undefined });
    if (id) {
      const updated = await db
        .update(stockHoldings)
        .set({ lots })
        .where(and(eq(stockHoldings.id, id), eq(stockHoldings.userId, v.id)))
        .returning({ id: stockHoldings.id });
      if (!updated.length) return NOT_FOUND;
      revalidatePath("/", "layout");
      return { ok: true, id };
    }
    if (!symbol) return { ok: false, error: "Pick a stock." };
    const [dupe] = await db
      .select({ id: stockHoldings.id })
      .from(stockHoldings)
      .where(and(eq(stockHoldings.userId, v.id), eq(stockHoldings.symbol, symbol)));
    if (dupe) return { ok: false, error: `You already have ${symbol}. Edit its lots instead.` };
    const [last] = await db
      .select({ max: sql<number>`coalesce(max(${stockHoldings.sortOrder}), -1)`.mapWith(Number) })
      .from(stockHoldings)
      .where(eq(stockHoldings.userId, v.id));
    const [row] = await db
      .insert(stockHoldings)
      .values({ userId: v.id, symbol, lots, sortOrder: (last?.max ?? -1) + 1 })
      .returning({ id: stockHoldings.id });
    revalidatePath("/", "layout");
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteStock(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(stockHoldings)
      .where(and(eq(stockHoldings.id, z.number().int().parse(id)), eq(stockHoldings.userId, v.id)))
      .returning({ id: stockHoldings.id });
    if (!deleted.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ watchlist (Money → Stocks card) */

const MAX_WATCHLIST = 15;
const TickerInput = z
  .string()
  .transform((s) => s.trim().toUpperCase().replace(/\.JK$/, ""))
  .pipe(z.string().regex(/^[A-Z0-9]{2,6}$/, "Enter an IDX code, e.g. TLKM"));

/** Adds an IDX stock to your watchlist after checking Yahoo knows it. */
export async function addWatchStock(rawSymbol: string): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const symbol = TickerInput.parse(rawSymbol);
    const rows = await db
      .select({ symbol: stockWatchlist.symbol, sortOrder: stockWatchlist.sortOrder })
      .from(stockWatchlist)
      .where(eq(stockWatchlist.userId, v.id));
    if (rows.some((r) => r.symbol === symbol)) return { ok: false, error: `${symbol} is already on your list.` };
    if (rows.length >= MAX_WATCHLIST) return { ok: false, error: `Your list holds up to ${MAX_WATCHLIST} stocks. Remove one first.` };

    let found: Awaited<ReturnType<typeof lookupIdxStock>>;
    try {
      found = await lookupIdxStock(symbol);
    } catch {
      return { ok: false, error: "Couldn't reach Yahoo Finance. Try again in a moment." };
    }
    if (!found) return { ok: false, error: `Couldn't find ${symbol} on the IDX.` };

    const [row] = await db
      .insert(stockWatchlist)
      .values({ userId: v.id, symbol, name: found.name, sortOrder: Math.max(-1, ...rows.map((r) => r.sortOrder)) + 1 })
      .returning({ id: stockWatchlist.id });
    revalidatePath("/money");
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err);
  }
}

export async function removeWatchStock(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(stockWatchlist)
      .where(and(eq(stockWatchlist.id, z.number().int().parse(id)), eq(stockWatchlist.userId, v.id)))
      .returning({ id: stockWatchlist.id });
    if (!deleted.length) return NOT_FOUND;
    revalidatePath("/money");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
