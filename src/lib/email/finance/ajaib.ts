import { STOCK_SYMBOLS } from "@/lib/constants";
import { has, labelled, mainAmount, parseNumber, tickerIn } from "./common";
import type { FinanceEmail, ParsedFinance } from "./types";

const KNOWN = [...STOCK_SYMBOLS, "BMRI", "BBNI", "TLKM", "ASII", "UNVR", "ICBP", "GOTO", "ANTM"];

/** Ajaib: dividends (income), buy/sell confirmations (a lots suggestion), RDN top-ups and withdrawals. */
export function parseAjaib(e: FinanceEmail): ParsedFinance | null {
  const body = `${e.subject}\n${e.text}`;
  const base = { source: "ajaib" as const, occurredAt: e.receivedAt.toISOString() };
  const ticker = tickerIn(body, KNOWN);

  if (has(body, "dividen", "dividend")) {
    const money = mainAmount(body);
    if (!money) return null;
    return {
      ...base,
      kind: "dividend",
      amount: money.amount,
      title: ticker ? `Dividend ${ticker}` : "Stock dividend",
      counterparty: ticker,
      confident: money.sure && Boolean(ticker),
    };
  }

  const buy = has(body, "beli", "buy");
  const sell = has(body, "jual", "sell");
  if ((buy || sell) && has(body, "order", "konfirmasi transaksi", "trade confirmation", "transaksi saham", "matched", "terpenuhi", "done", "berhasil")) {
    const lotsMatch = /(\d[\d.,]*)\s*lot\b/i.exec(body);
    const lots = lotsMatch ? parseNumber(lotsMatch[1]) : null;
    const priceMatch = /\b(?:harga rata-rata|avg price|average price|harga|price)\s*[:\-]?\s*(?:Rp\.?|IDR)?\s*(\d[\d.,]*)/i.exec(body);
    const price = priceMatch ? parseNumber(priceMatch[1]) : null;
    const money = mainAmount(body);
    if (!ticker || !lots) return null;
    const side = buy && !sell ? "buy" : sell && !buy ? "sell" : null;
    if (!side) return null;
    return {
      ...base,
      kind: "trade",
      amount: money?.amount ?? (price ? price * lots * 100 : 0),
      title: `${side === "buy" ? "Buy" : "Sell"} ${lots} lot ${ticker}`,
      counterparty: ticker,
      confident: true,
      stock: { symbol: ticker, side, lots, price },
    };
  }

  const money = mainAmount(body);
  if (!money) return null;
  if (has(body, "top up", "topup", "top-up", "deposit", "setor", "isi saldo", "dana masuk")) {
    return { ...base, kind: "topup", amount: money.amount, title: "Ajaib top up", counterparty: labelled(body, ["dari", "from", "sumber dana", "bank"]), confident: money.sure };
  }
  if (has(body, "penarikan", "withdraw", "tarik dana")) {
    return { ...base, kind: "transfer_out", amount: money.amount, title: "Ajaib withdrawal", counterparty: labelled(body, ["ke", "to", "tujuan", "bank"]), confident: money.sure };
  }
  return null;
}
