/**
 * Sample wallets for the seed and for migrating sample data that predates wallets.
 * Only used on generated sample data — never on transactions you entered.
 */
import type { TxType, WalletType } from "../lib/constants";
import { dateIn, zoned } from "../lib/dates";

export const SAMPLE_WALLETS = [
  { key: "bca", name: "BCA", type: "bank", openingBalance: 25_000_000 },
  { key: "mandiri", name: "Mandiri", type: "bank", openingBalance: 8_000_000 },
  { key: "gopay", name: "GoPay", type: "ewallet", openingBalance: 150_000 },
  { key: "ovo", name: "OVO", type: "ewallet", openingBalance: 100_000 },
  { key: "cash", name: "Cash", type: "cash", openingBalance: 300_000 },
] as const satisfies readonly { key: string; name: string; type: WalletType; openingBalance: number }[];

export type SampleWalletKey = (typeof SAMPLE_WALLETS)[number]["key"];

/** Where a sample transaction was most likely paid from / received into. */
export function sampleWalletFor(type: TxType, title: string, category: string): SampleWalletKey {
  const t = title.toLowerCase();
  if (type === "income") {
    if (category === "Freelance") return "mandiri";
    if (t.includes("cashback")) return "gopay";
    return "bca";
  }
  if (/^go(food|ride)/.test(t)) return "gopay";
  if (/^grab|kopi kenangan|fore coffee|starbucks/.test(t)) return "ovo";
  if (/krl|mrt/.test(t)) return "gopay";
  if (/warteg|bakmi|bensin|apotek/.test(t)) return "cash";
  if (category === "Shopping" || category === "Groceries") return "mandiri";
  return "bca";
}

/**
 * Monthly top-ups from BCA into e-wallets and cash, sized to cover each
 * month's spending from that wallet, so their balances stay positive.
 */
export function sampleTopUps(
  txs: { wallet: SampleWalletKey; type: TxType; amount: number; date: Date }[],
  now: Date,
  tz: string,
): { from: SampleWalletKey; to: SampleWalletKey; amount: number; date: Date; note: string }[] {
  const out: { from: SampleWalletKey; to: SampleWalletKey; amount: number; date: Date; note: string }[] = [];
  // Months are read in the user's timezone, not the server's (Vercel runs in UTC).
  const ym = (d: Date) => {
    const z = zoned(d, tz);
    return { y: z.getFullYear(), m: z.getMonth() };
  };
  const months = new Map<string, { y: number; m: number }>();
  for (const t of txs) {
    const k = ym(t.date);
    months.set(`${k.y}-${String(k.m).padStart(2, "0")}`, k);
  }
  for (const key of [...months.keys()].sort()) {
    const { y, m } = months.get(key)!;
    for (const to of ["gopay", "ovo", "cash"] as const) {
      const net = txs
        .filter((t) => {
          if (t.wallet !== to) return false;
          const k = ym(t.date);
          return k.y === y && k.m === m;
        })
        .reduce((s, t) => s + (t.type === "expense" ? t.amount : -t.amount), 0);
      if (net <= 0) continue;
      const date = new Date(dateIn(tz, y, m, 1, 7, 0).getTime());
      if (date > now) continue;
      out.push({
        from: "bca",
        to,
        amount: Math.ceil(net / 100_000) * 100_000 + 100_000,
        date,
        note: to === "cash" ? "ATM withdrawal" : "Top up",
      });
    }
  }
  return out;
}
