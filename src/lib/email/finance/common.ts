import type { FinanceSource } from "@/lib/constants";

/* Helpers shared by the bank / e-wallet / broker parsers. Pure functions (unit-tested). */

/** Sender domains per source. A subdomain counts too (e.g. mail.bca.co.id). */
export const FINANCE_SENDER_DOMAINS: Record<FinanceSource, string[]> = {
  bca: ["bca.co.id", "klikbca.com"],
  mandiri: ["bankmandiri.co.id"],
  gopay: ["gojek.com", "gopay.co.id"],
  ajaib: ["ajaib.co.id"],
};

export function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).trim().toLowerCase();
}

export function domainMatches(domain: string, pattern: string): boolean {
  return domain === pattern || domain.endsWith(`.${pattern}`);
}

/** Which parser handles mail from this address (null = not a transaction sender). */
export function financeSourceOf(address: string): FinanceSource | null {
  const domain = domainOf(address);
  for (const [source, domains] of Object.entries(FINANCE_SENDER_DOMAINS) as [FinanceSource, string[]][]) {
    if (domains.some((d) => domainMatches(domain, d))) return source;
  }
  return null;
}

/**
 * "1.234.567,00" / "1,234,567.00" / "125.000" / "125000" / "1.500" → whole rupiah.
 * The last separator is a decimal point only when 1–2 digits follow it.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/[\s ]/g, "").replace(/[.,\-]+$/, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let whole = s;
  let fraction = "";
  if (last !== -1 && s.length - last - 1 <= 2) {
    whole = s.slice(0, last);
    fraction = s.slice(last + 1);
  }
  const digits = whole.replace(/[.,]/g, "");
  if (!digits) return null;
  const n = Number(digits) + (fraction ? Number(`0.${fraction}`) : 0);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const MONEY = String.raw`(?:Rp\.?|IDR)\s?(\d[\d.,]*\d|\d)`;

/** Every amount written as "Rp …" or "IDR …", in order. */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(new RegExp(MONEY, "gi"))) {
    const n = parseNumber(m[1]);
    if (n !== null && n > 0) out.push(n);
  }
  return out;
}

const AMOUNT_LABELS = [
  "total pembayaran",
  "total bayar",
  "total payment",
  "total transaksi",
  "nominal transaksi",
  "nominal top[- ]?up",
  "jumlah transfer",
  "jumlah dividen",
  "dividen bersih",
  "net dividend",
  "nominal",
  "jumlah",
  "amount",
  "total",
  "sebesar",
];

/**
 * The transaction amount: the first labelled one ("Nominal: Rp 50.000", "Total Rp …"),
 * otherwise the only distinct amount in the text. `sure` is false when it had to pick
 * between several unlabelled amounts.
 */
export function mainAmount(text: string): { amount: number; sure: boolean } | null {
  for (const label of AMOUNT_LABELS) {
    const m = new RegExp(String.raw`\b${label}\b[^\dRpI\n]{0,20}${MONEY}`, "i").exec(text);
    if (m) {
      const n = parseNumber(m[1]);
      if (n && n > 0) return { amount: n, sure: true };
    }
  }
  const all = amountsIn(text);
  if (!all.length) return null;
  const distinct = [...new Set(all)];
  return { amount: all[0], sure: distinct.length === 1 };
}

/** The value after one of the labels ("Penerima : Budi Santoso" → "Budi Santoso"), max 60 chars. */
export function labelled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const m = new RegExp(String.raw`(?:^|\n|\s)${label}\s*[:\-]\s*([^\n|]+)`, "i").exec(text);
    if (m) {
      const v = m[1].replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
      if (v && !/^(?:Rp|IDR)\b/i.test(v)) return v.slice(0, 60);
    }
  }
  return null;
}

/** True when any of the words/phrases appears (case-insensitive, word-ish boundaries). */
export function has(text: string, ...words: string[]): boolean {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w.toLowerCase()));
}

/** E-wallets / brokers a bank transfer might be going to (then it's probably your own money moving). */
export const OWN_MONEY_TARGETS = ["gopay", "gojek", "ovo", "dana", "shopeepay", "linkaja", "ajaib", "rdn", "flip", "jago", "jenius", "seabank", "blu"];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** Readable text from an HTML email: table cells and blocks become line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d|table|section)>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " : ")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").replace(/^\s*:\s*|\s*:\s*$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Text with repeated whitespace squashed, for keyword checks. */
export function flat(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const TICKER_LABELS = ["kode saham", "kode efek", "saham", "stock code", "stock", "ticker", "symbol", "emiten"];

/** The IDX ticker an email is about: a labelled one ("Kode Saham: BBCA"), else a known ticker in the text. */
export function tickerIn(text: string, known: readonly string[]): string | null {
  const v = labelled(text, TICKER_LABELS);
  const fromLabel = v && /\b([A-Z]{4})\b/.exec(v.toUpperCase());
  if (fromLabel) return fromLabel[1];
  for (const t of known) if (new RegExp(String.raw`\b${t}\b`).test(text)) return t;
  return null;
}
