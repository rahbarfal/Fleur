import type { FinanceSource } from "@/lib/constants";
import { parseAjaib } from "./ajaib";
import { parseBca } from "./bca";
import { parseGopay } from "./gopay";
import { parseMandiri } from "./mandiri";
import type { FinanceEmail, ParsedFinance } from "./types";

export { financeSourceOf } from "./common";
export type { FinanceEmail, FinanceKind, ParsedFinance } from "./types";

const PARSERS: Record<FinanceSource, (e: FinanceEmail) => ParsedFinance | null> = {
  bca: parseBca,
  mandiri: parseMandiri,
  gopay: parseGopay,
  ajaib: parseAjaib,
};

/** Reads a transaction out of a bank / e-wallet / broker email. Null = not a transaction email. */
export function parseFinanceEmail(source: FinanceSource, e: FinanceEmail): ParsedFinance | null {
  const parsed = PARSERS[source](e);
  return parsed && (parsed.amount > 0 || parsed.kind === "trade") ? parsed : null;
}
