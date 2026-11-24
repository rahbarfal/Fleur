import type { FinanceSource } from "@/lib/constants";
import { FINANCE_SOURCE_LABEL } from "@/lib/constants";
import { OWN_MONEY_TARGETS, has, labelled, mainAmount } from "./common";
import type { FinanceEmail, ParsedFinance } from "./types";

/*
 * Bank notification emails (BCA, Livin' by Mandiri). Both use labelled fields like
 * "Nominal : Rp 50.000,00" / "Penerima : …" / "Amount : IDR 50,000.00", so one reader
 * covers both; bca.ts / mandiri.ts only add their own wording.
 */

const COUNTERPARTY_LABELS = [
  "nama penerima",
  "penerima",
  "beneficiary name",
  "beneficiary",
  "receiver",
  "rekening tujuan",
  "tujuan",
  "nama merchant",
  "merchant",
  "penyedia jasa",
  "biller",
  "pembayaran ke",
  "kepada",
  "pengirim",
  "nama pengirim",
  "sender",
  "dari",
];

const NOT_TRANSACTIONS = ["e-statement", "estatement", "rekening koran", "statement", "kode otp", "one time password", "promo"];

export function parseBankEmail(source: FinanceSource, e: FinanceEmail): ParsedFinance | null {
  const body = `${e.subject}\n${e.text}`;
  if (has(e.subject, ...NOT_TRANSACTIONS)) return null;
  const money = mainAmount(body);
  if (!money) return null;

  const counterparty = labelled(body, COUNTERPARTY_LABELS);
  const cpLower = (counterparty ?? "").toLowerCase();
  const toOwnMoney =
    OWN_MONEY_TARGETS.some((t) => cpLower.includes(t)) ||
    has(body, "top up", "top-up", "topup", "isi saldo", "virtual account");

  const creditCard = has(body, "kartu kredit", "credit card");
  const incoming =
    !creditCard &&
    has(body, "dana masuk", "transfer masuk", "incoming transfer", "anda menerima", "telah menerima", "you received", "credited", "kredit rekening", "mutasi kredit");
  const transfer = has(body, "transfer");
  const payment = creditCard || has(body, "pembayaran", "payment", "pembelian", "purchase", "qris", "tarik tunai", "withdrawal", "tagihan", "debit");

  const name = FINANCE_SOURCE_LABEL[source];
  const base = { source, amount: money.amount, counterparty, occurredAt: e.receivedAt.toISOString() };

  if (incoming) {
    return { ...base, kind: "income", title: counterparty ? `Transfer from ${counterparty}` : `${name} incoming transfer`, confident: money.sure };
  }
  if (toOwnMoney || transfer) {
    // Could be your own e-wallet/broker, or paying someone: always reviewed.
    return { ...base, kind: "transfer_out", title: counterparty ? `Transfer to ${counterparty}` : `${name} transfer`, confident: money.sure };
  }
  if (payment) {
    return { ...base, kind: "expense", title: counterparty ?? `${name} payment`, confident: money.sure && Boolean(counterparty) };
  }
  return null;
}
