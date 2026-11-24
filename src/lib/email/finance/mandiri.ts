import { parseBankEmail } from "./bank";
import type { FinanceEmail, ParsedFinance } from "./types";

/** Livin' by Mandiri: "Transfer Berhasil", "Pembayaran Berhasil", "Top-up Berhasil", "Dana Masuk". */
export function parseMandiri(e: FinanceEmail): ParsedFinance | null {
  return parseBankEmail("mandiri", e);
}
