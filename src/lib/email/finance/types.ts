import type { FinanceSource } from "@/lib/constants";

/**
 * What a bank / e-wallet / broker email says happened.
 * - expense / income: money left or entered that wallet
 * - dividend: stock dividend paid out (income)
 * - topup: an e-wallet was topped up (money came from another of your wallets)
 * - transfer_out: the bank sent money to another account (maybe your own e-wallet)
 * - trade: a stock buy/sell confirmation (suggests a lots change, never applied by itself)
 */
export type FinanceKind = "expense" | "income" | "dividend" | "topup" | "transfer_out" | "trade";

export type ParsedFinance = {
  source: FinanceSource;
  kind: FinanceKind;
  /** Whole rupiah, > 0. */
  amount: number;
  /** Suggested transaction title, e.g. "GoFood · Kopi Kenangan". */
  title: string;
  /** Merchant / recipient / sender as written in the email. */
  counterparty: string | null;
  /** ISO timestamp (the email's received time unless the email states one). */
  occurredAt: string;
  /** False when a field had to be guessed; such emails always wait for review. */
  confident: boolean;
  stock?: { symbol: string; side: "buy" | "sell"; lots: number; price: number | null };
  /** Filled in when the email is filed: why it waits for review. */
  reason?: string;
  /** A top-up paired with the bank's debit email (both describe one transfer). */
  pairEmailId?: number;
};

/** The parts of an email a parser reads. */
export type FinanceEmail = {
  fromAddress: string;
  subject: string;
  text: string;
  receivedAt: Date;
};
