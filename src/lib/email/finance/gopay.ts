import { has, labelled, mainAmount } from "./common";
import type { FinanceEmail, ParsedFinance } from "./types";

const SERVICES = ["GoFood", "GoRide", "GoCar", "GoMart", "GoSend", "GoBox", "GoTagihan", "GoPulsa", "GoShop", "GoMed"];
const BANKS = ["BCA", "Mandiri", "BRI", "BNI", "Jago", "SeaBank", "CIMB", "Permata", "Jenius", "Ajaib"];

/** GoPay / Gojek receipts: payments, top-ups, money received, transfers to friends. */
export function parseGopay(e: FinanceEmail): ParsedFinance | null {
  const body = `${e.subject}\n${e.text}`;
  const money = mainAmount(body);
  if (!money) return null;
  const base = { source: "gopay" as const, amount: money.amount, occurredAt: e.receivedAt.toISOString() };

  if (has(body, "top up", "top-up", "topup", "isi saldo")) {
    const from = labelled(body, ["sumber dana", "metode", "dari", "from", "via"]) ?? BANKS.find((b) => new RegExp(String.raw`\b${b}\b`, "i").test(body)) ?? null;
    return { ...base, kind: "topup", title: "GoPay top up", counterparty: from, confident: money.sure };
  }
  if (has(body, "kamu menerima", "you received", "menerima saldo", "dana masuk", "received from", "kamu dapat kiriman")) {
    const from = labelled(body, ["dari", "from", "pengirim"]);
    return { ...base, kind: "income", title: from ? `GoPay from ${from}` : "GoPay received", counterparty: from, confident: money.sure };
  }
  if (has(body, "transfer ke", "kirim ke", "send to", "transfer berhasil", "kirim saldo")) {
    const to = labelled(body, ["penerima", "ke", "to", "tujuan"]);
    return { ...base, kind: "transfer_out", title: to ? `GoPay to ${to}` : "GoPay transfer", counterparty: to, confident: money.sure };
  }
  if (has(body, "pembayaran", "payment", "bayar", "order", "pesanan", "receipt", "struk", "terima kasih", "thank you", ...SERVICES)) {
    const service = SERVICES.find((s) => new RegExp(String.raw`\b${s}\b`, "i").test(body)) ?? null;
    const merchant = labelled(body, ["nama merchant", "merchant", "nama toko", "toko", "restoran", "resto", "dibayar ke", "paid to", "pembayaran ke"]);
    // Paid with cash or PayLater: not money out of the GoPay wallet; let you decide.
    const notGopayMoney = (has(body, "tunai", "cash") && !has(body, "gopay saldo", "saldo gopay")) || has(body, "paylater", "pay later");
    const title = [service, merchant].filter(Boolean).join(" · ") || "GoPay payment";
    return {
      ...base,
      kind: "expense",
      title,
      counterparty: merchant ?? service,
      confident: money.sure && Boolean(merchant || service) && !notGopayMoney,
    };
  }
  return null;
}
