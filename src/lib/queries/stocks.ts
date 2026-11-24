import "server-only";
import { format, startOfMonth } from "date-fns";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stockHoldings, stockPrices, stockWatchlist } from "@/db/schema";
import { LOT_SIZE, STOCKS, type StockSymbol } from "@/lib/constants";
import { pctChange } from "@/lib/format";
import type { Viewer } from "@/lib/viewer";
import { zoned } from "@/lib/dates";

/*
 * Stock quotes for the Money page, from Yahoo Finance's public chart endpoint
 * (IDX tickers use the ".JK" suffix). Prices are delayed ~15 minutes.
 * Results are cached in memory for 5 minutes. Every fresh price is also saved
 * in Postgres (stock_prices) so your stock holdings can fall back to the last known
 * price. The Stocks card shows an error state instead of made-up prices.
 */

export const STOCK_RANGES = ["1mo", "3mo", "6mo", "1y"] as const;
export type StockRange = (typeof STOCK_RANGES)[number];

export type StockQuote =
  | {
      ok: true;
      symbol: string;
      name: string;
      price: number;
      prevClose: number;
      /** When the exchange last traded (ms). */
      marketTime: number;
      dayChange: number;
      dayChangePct: number;
      rangeChangePct: number;
      dayHigh: number;
      dayLow: number;
      volume: number;
      high52: number;
      low52: number;
      /** Daily closes; `t` is the trading day's timestamp (ms). */
      points: { t: number; label: string; close: number }[];
      updatedLabel: string;
    }
  | { ok: false; symbol: string; name: string; error: string };

type YahooChart = {
  chart: {
    result?: {
      meta: {
        regularMarketPrice: number;
        regularMarketTime: number;
        longName?: string;
        shortName?: string;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
      };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
};

const TTL_MS = 5 * 60_000;
const cache = (globalThis as unknown as { __fleurStocks?: Map<string, { at: number; quote: StockQuote }> }).__fleurStocks ??
  new Map();
(globalThis as unknown as { __fleurStocks?: typeof cache }).__fleurStocks = cache;

async function fetchQuote(symbol: string, name: string, range: StockRange): Promise<StockQuote> {
  const key = `${symbol}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.quote;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.JK?range=${range}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as YahooChart;
    const r = json.chart.result?.[0];
    if (!r) throw new Error(json.chart.error?.description ?? "No data");

    const closes = r.indicators.quote[0]?.close ?? [];
    const points = (r.timestamp ?? [])
      .map((t, i) => ({ t, close: closes[i] }))
      .filter((p): p is { t: number; close: number } => typeof p.close === "number")
      .map((p) => ({ t: p.t * 1000, label: format(new Date(p.t * 1000), "d MMM yyyy"), close: p.close }));
    if (points.length < 2) throw new Error("Not enough data");

    const m = r.meta;
    const price = m.regularMarketPrice;
    const prev = points[points.length - 2].close;
    const first = points[0].close;
    const quote: StockQuote = {
      ok: true,
      symbol,
      name,
      price,
      prevClose: prev,
      marketTime: m.regularMarketTime * 1000,
      dayChange: price - prev,
      dayChangePct: ((price - prev) / prev) * 100,
      rangeChangePct: ((price - first) / first) * 100,
      dayHigh: m.regularMarketDayHigh ?? price,
      dayLow: m.regularMarketDayLow ?? price,
      volume: m.regularMarketVolume ?? 0,
      high52: m.fiftyTwoWeekHigh ?? price,
      low52: m.fiftyTwoWeekLow ?? price,
      points,
      updatedLabel: format(new Date(m.regularMarketTime * 1000), "d MMM, HH:mm"),
    };
    cache.set(key, { at: Date.now(), quote });
    await savePrice(quote);
    return quote;
  } catch (err) {
    // Serve a stale copy if we have one rather than nothing.
    if (hit) return hit.quote;
    return { ok: false, symbol, name, error: err instanceof Error ? err.message : "Request failed" };
  }
}

/** A quote on your watchlist, with the row id (to remove it). */
export type WatchQuote = StockQuote & { watchId: number };

/** Your watchlist (Money → Stocks card); "updated" times are shown in your timezone. */
export async function getStocks(v: Viewer, range: StockRange): Promise<WatchQuote[]> {
  const rows = await db
    .select()
    .from(stockWatchlist)
    .where(eq(stockWatchlist.userId, v.id))
    .orderBy(asc(stockWatchlist.sortOrder), asc(stockWatchlist.id));
  const quotes = await Promise.all(rows.map((s) => fetchQuote(s.symbol, s.name, range)));
  return quotes.map((q, i) => ({
    ...(q.ok ? { ...q, updatedLabel: format(zoned(new Date(q.marketTime), v.tz), "d MMM, HH:mm") } : q),
    watchId: rows[i].id,
  }));
}

/** "PT Telkom Indonesia (Persero) Tbk." → "Telkom Indonesia" (shorter for the card). */
function companyName(raw: string): string {
  return raw
    .replace(/^PT\.?\s+/i, "")
    .replace(/\s*\(Persero\)/i, "")
    .replace(/,?\s*Tbk\.?$/i, "")
    .trim();
}

/** Checks that an IDX ticker exists on Yahoo (`<SYMBOL>.JK`). Null when it doesn't; throws when Yahoo can't be reached. */
export async function lookupIdxStock(symbol: string): Promise<{ symbol: string; name: string } | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.JK?range=5d&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = (await res.json()) as YahooChart;
  const meta = json.chart.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;
  return { symbol, name: companyName(meta.shortName ?? meta.longName ?? symbol) || symbol };
}

/** Remembers the latest good price (best effort: a failed write never breaks the page). */
async function savePrice(q: Extract<StockQuote, { ok: true }>) {
  try {
    const row = {
      symbol: q.symbol as StockSymbol,
      price: q.price,
      prevClose: q.prevClose,
      marketTime: new Date(q.marketTime),
      fetchedAt: new Date(),
    };
    await db.insert(stockPrices).values(row).onConflictDoUpdate({ target: stockPrices.symbol, set: row });
  } catch (err) {
    console.error("Could not save stock price", err);
  }
}

export type WalletPrice = {
  symbol: StockSymbol;
  /** Per share, IDR. Null = never fetched successfully. */
  price: number | null;
  /** Last close before this month started (viewer's timezone); null if unknown. */
  monthStartPrice: number | null;
  /** True when Yahoo failed and the saved price is used. */
  stale: boolean;
  /** e.g. "16 Nov, 14:05" in the viewer's timezone. */
  asOfLabel: string | null;
};

/** Current price of every stock you can hold, with the saved price as fallback. */
export async function getWalletPrices(now: Date, tz: string): Promise<Record<StockSymbol, WalletPrice>> {
  const monthStart = startOfMonth(now).getTime();
  const label = (ms: number) => format(zoned(new Date(ms), tz), "d MMM, HH:mm");
  const quotes = await Promise.all(STOCKS.map((s) => fetchQuote(s.symbol, s.name, "3mo")));

  const out = {} as Record<StockSymbol, WalletPrice>;
  let saved: (typeof stockPrices.$inferSelect)[] | null = null;
  for (const [i, s] of STOCKS.entries()) {
    const q = quotes[i];
    if (q.ok) {
      const before = q.points.filter((p) => p.t < monthStart);
      out[s.symbol] = {
        symbol: s.symbol,
        price: q.price,
        monthStartPrice: before.length ? before[before.length - 1].close : null,
        stale: false,
        asOfLabel: label(q.marketTime),
      };
      continue;
    }
    saved ??= await db.select().from(stockPrices).catch(() => []);
    const row = saved.find((r) => r.symbol === s.symbol);
    out[s.symbol] = {
      symbol: s.symbol,
      price: row?.price ?? null,
      monthStartPrice: null,
      stale: true,
      asOfLabel: row ? label(row.marketTime.getTime()) : null,
    };
  }
  return out;
}

export type StockHoldingView = {
  id: number;
  symbol: StockSymbol;
  company: string;
  lots: number;
  shares: number;
  /** Per share; null = no price known yet (the holding counts as Rp 0). */
  price: number | null;
  /** lots × 100 × price */
  value: number;
  /** Value at the start of this month (same lots, the month-start price). */
  monthStartValue: number;
  /** % since the start of the month; null when the month-start price is unknown. */
  change: number | null;
  asOfLabel: string | null;
  /** Yahoo couldn't be reached: the last saved price is used. */
  stale: boolean;
};

/** Your stocks, valued at lots × 100 × the current price (prices are only fetched if you hold any). */
export async function getStockHoldings(v: Viewer, now: Date): Promise<StockHoldingView[]> {
  const rows = await db
    .select()
    .from(stockHoldings)
    .where(eq(stockHoldings.userId, v.id))
    .orderBy(asc(stockHoldings.sortOrder), asc(stockHoldings.id));
  if (!rows.length) return [];
  const prices = await getWalletPrices(now, v.tz);
  return rows.map((h) => {
    const p = prices[h.symbol];
    const shares = h.lots * LOT_SIZE;
    const value = p?.price != null ? Math.round(shares * p.price) : 0;
    const monthStartValue = p?.monthStartPrice != null ? Math.round(shares * p.monthStartPrice) : value;
    return {
      id: h.id,
      symbol: h.symbol,
      company: STOCKS.find((s) => s.symbol === h.symbol)?.name ?? h.symbol,
      lots: h.lots,
      shares,
      price: p?.price ?? null,
      value,
      monthStartValue,
      change: p?.monthStartPrice != null ? pctChange(value, monthStartValue) : null,
      asOfLabel: p?.asOfLabel ?? null,
      stale: p?.stale ?? true,
    };
  });
}
