import { parseBankEmail } from "./bank";
import type { FinanceEmail, ParsedFinance } from "./types";

/** BCA (klikBCA / BCA mobile): "Internet Transaction Journal", "Notifikasi Transaksi", QRIS and VA payments. */
export function parseBca(e: FinanceEmail): ParsedFinance | null {
  return parseBankEmail("bca", e);
}
