/*
 * Number formatting without Intl.
 *
 * Intl output differs between Node and Safari (e.g. Node prints "Rp 32.000"
 * with a no-break space, Safari prints "Rp32.000"), which breaks React
 * hydration. These helpers produce identical strings everywhere.
 */

/** 57605000 → "57.605.000" (rounds to an integer, no sign). */
function groupThousands(n: number): string {
  return Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Rp 1.250.000 · -Rp 4.061.000 */
export function formatIDR(amount: number): string {
  const sign = Math.round(amount) < 0 ? "-" : "";
  return `${sign}Rp ${groupThousands(amount)}`;
}

/** 1.250.000 */
export function formatNumber(n: number): string {
  return `${Math.round(n) < 0 ? "-" : ""}${groupThousands(n)}`;
}

/** One decimal with a comma, dropping ",0": 8.62 → "8,6", 9 → "9". */
function oneDecimal(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? groupThousands(r) : r.toFixed(1).replace(".", ",");
}

/** Rp1,2jt · Rp850rb · Rp1,1M */
export function formatIDRCompact(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const fmt = (n: number) => (n >= 100 ? groupThousands(n) : oneDecimal(n));
  if (abs >= 1e9) return `${sign}Rp${fmt(abs / 1e9)}M`;
  if (abs >= 1e6) return `${sign}Rp${fmt(abs / 1e6)}jt`;
  if (abs >= 1e3) return `${sign}Rp${fmt(abs / 1e3)}rb`;
  return `${sign}Rp${Math.round(abs)}`;
}

/** Signed and short, for calendar cells: +Rp234K · -Rp500K · +Rp1,2M · +Rp23M · -Rp950 · Rp0 */
export function formatIDRShort(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "Rp0";
  const sign = n < 0 ? "-" : "+";
  const abs = Math.abs(n);
  const fmt = (x: number) => (x < 10 ? oneDecimal(x) : groupThousands(Math.round(x)));
  if (abs >= 1e9) return `${sign}Rp${fmt(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}Rp${fmt(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}Rp${fmt(abs / 1e3)}K`;
  return `${sign}Rp${abs}`;
}

/** 109404600 → "109,4jt" (share volume etc.) */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${oneDecimal(n / 1e9)}M`;
  if (abs >= 1e6) return `${oneDecimal(n / 1e6)}jt`;
  if (abs >= 1e3) return `${oneDecimal(n / 1e3)}rb`;
  return formatNumber(n);
}

/** Percentage change from `prev` to `curr`, or null when there is no baseline. */
export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function formatPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

/** "50.000" / "Rp 50,000" / "50000" → 50000 */
export function parseAmount(input: string): number {
  const digits = input.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}
