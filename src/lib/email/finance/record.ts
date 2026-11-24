import "server-only";
import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { categories, emailWalletLinks, emails, transactions, wallets } from "@/db/schema";
import { FINANCE_SOURCE_LABEL, FINANCE_SOURCES, type FinanceSource, type FinanceStatus } from "@/lib/constants";
import type { ParsedFinance } from "./types";

/*
 * Files a parsed bank / e-wallet / broker email:
 *   recorded → a transaction was added to Money (source "email", undoable)
 *   review   → waits for you in the Inbox's "To review" (with the reason)
 * Only confident expenses / income / dividends with a known wallet and no look-alike
 * transaction are recorded by themselves. Top-ups, transfers and trades always wait.
 */

type Conn = Tx | typeof db;

const DAY = 86_400_000;
const PAIR_WINDOW = 30 * 60_000;
const PAIR_REASON = "Transfer between your wallets?";

/** Wallet names that identify a source's wallet when no link is saved yet. */
export const WALLET_ALIASES: Record<FinanceSource, string[]> = {
  bca: ["bca"],
  mandiri: ["mandiri", "livin"],
  gopay: ["gopay", "gojek"],
  ajaib: ["ajaib", "rdn"],
};

export type SourceWallet = { id: number; name: string; linked: boolean };

type WalletRow = { id: number; name: string };

/** Each source's wallet: the saved link, else the single active wallet whose name matches. */
export async function sourceWallets(userId: string, conn: Conn = db): Promise<Record<FinanceSource, SourceWallet | null>> {
  const [links, active] = await Promise.all([
    conn
      .select({ source: emailWalletLinks.source, walletId: emailWalletLinks.walletId })
      .from(emailWalletLinks)
      .where(eq(emailWalletLinks.userId, userId)),
    conn
      .select({ id: wallets.id, name: wallets.name })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt))),
  ]);
  return Object.fromEntries(
    FINANCE_SOURCES.map((source) => [source, pickWallet(source, links.find((l) => l.source === source)?.walletId, active)]),
  ) as Record<FinanceSource, SourceWallet | null>;
}

function pickWallet(source: FinanceSource, linkedId: number | undefined, active: WalletRow[]): SourceWallet | null {
  // A link to an archived (or stock) wallet counts as unset.
  const linked = linkedId !== undefined ? active.find((w) => w.id === linkedId) : undefined;
  if (linked) return { ...linked, linked: true };
  const matches = active.filter((w) => WALLET_ALIASES[source].some((a) => w.name.toLowerCase().includes(a)));
  return matches.length === 1 ? { ...matches[0], linked: false } : null;
}

export async function walletForSource(userId: string, source: FinanceSource, conn: Conn = db): Promise<SourceWallet | null> {
  return (await sourceWallets(userId, conn))[source];
}

/** Merchant words → words in your own category names. */
const CATEGORY_HINTS: { words: string[]; names: string[] }[] = [
  {
    words: ["gofood", "grabfood", "shopeefood", "kopi", "coffee", "cafe", "resto", "restaurant", "bakmi", "bakery", "mcd", "kfc", "starbucks", "janji jiwa", "chatime", "warung", "makan", "food"],
    names: ["food", "makan", "dining", "drink"],
  },
  {
    words: ["goride", "gocar", "grabcar", "grabbike", "bluebird", "krl", "mrt", "transjakarta", "commuter", "pertamina", "shell", "parkir", "toll", " tol ", "bensin", "kai "],
    names: ["transport"],
  },
  { words: ["indomaret", "alfamart", "superindo", "hypermart", "lotte mart", "transmart", "ranch market", "gomart", "astro", "segari", "sayurbox"], names: ["grocer", "belanja"] },
  {
    words: ["pln", "listrik", "pdam", "telkomsel", "indihome", "xl ", "indosat", "smartfren", "bpjs", "pulsa", "paket data", "first media", "biznet", "gotagihan", "gopulsa"],
    names: ["bill", "tagihan", "utilit"],
  },
  { words: ["tokopedia", "shopee", "lazada", "blibli", "zalora", "uniqlo", "ikea", "goshop"], names: ["shop"] },
  { words: ["netflix", "spotify", "youtube", "disney", "vidio", "cgv", "xxi", "cinema", "steam", "playstation"], names: ["entertain", "hiburan", "subscri"] },
  { words: ["apotek", "halodoc", "pharmacy", "klinik", "hospital", "rumah sakit", "kimia farma", "guardian", "watsons", "gomed"], names: ["health", "kesehatan"] },
];

/** One of *your* categories (already loaded, of the right type) that fits the merchant, or null. */
export function pickCategory(mine: { id: number; name: string }[], p: Pick<ParsedFinance, "kind" | "title" | "counterparty">): number | null {
  const byName = (names: string[]) => mine.find((c) => names.some((n) => c.name.toLowerCase().includes(n)))?.id ?? null;
  if (p.kind === "dividend") return byName(["dividend", "dividen", "invest", "saham", "stock"]) ?? byName(["other"]);
  const text = ` ${p.title} ${p.counterparty ?? ""} `.toLowerCase();
  for (const h of CATEGORY_HINTS) if (h.words.some((w) => text.includes(w))) return byName(h.names);
  return null;
}

/** One of *your* categories that fits the merchant, or null (= Uncategorized). */
export async function guessCategory(userId: string, p: ParsedFinance, conn: Conn = db): Promise<number | null> {
  const mine = await conn
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.type, p.kind === "expense" ? "expense" : "income")));
  return pickCategory(mine, p);
}

const review = (p: ParsedFinance, reason: string) => ({ status: "review" as const, parsed: { ...p, reason } });

/** Decides recorded/review for one email and saves it (email row + maybe a transaction). */
export async function fileFinanceEmail(
  conn: Conn,
  userId: string,
  email: { id: number; source: FinanceSource },
  parsed: ParsedFinance | null,
): Promise<FinanceStatus> {
  const result = await decide(conn, userId, email, parsed);
  await conn
    .update(emails)
    .set({ financeStatus: result.status, parsed: result.parsed, processedAt: new Date() })
    .where(and(eq(emails.id, email.id), eq(emails.userId, userId)));
  return result.status;
}

async function decide(
  conn: Conn,
  userId: string,
  email: { id: number; source: FinanceSource },
  p: ParsedFinance | null,
): Promise<{ status: FinanceStatus; parsed: ParsedFinance | null }> {
  if (!p) return { status: "none", parsed: null };
  const label = FINANCE_SOURCE_LABEL[email.source];

  if (p.kind === "trade") return review(p, `Update your ${p.stock?.symbol ?? "stock"} lots?`);

  if (p.kind === "topup" || p.kind === "transfer_out") {
    const pair = await findPair(conn, userId, email, p);
    if (pair) {
      // Both emails describe the same transfer: link them and give both the same question.
      await conn
        .update(emails)
        .set({
          parsed: sql`jsonb_set(jsonb_set(${emails.parsed}, '{pairEmailId}', to_jsonb(${email.id}::int)), '{reason}', to_jsonb(${PAIR_REASON}::text))`,
        })
        .where(and(eq(emails.id, pair), eq(emails.userId, userId)));
      return review({ ...p, pairEmailId: pair }, PAIR_REASON);
    }
    return review(
      p,
      p.kind === "topup" ? `${label} top up: which wallet did the money come from?` : "Transfer: to one of your wallets, or a payment?",
    );
  }

  // expense / income / dividend
  const wallet = await walletForSource(userId, email.source, conn);
  if (!wallet) return review(p, `Pick the wallet for ${label} emails`);
  if (!p.confident) return review(p, "Check the details: not everything could be read");

  const type = p.kind === "expense" ? "expense" : "income";
  const at = new Date(p.occurredAt);
  const [lookAlike] = await conn
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.walletId, wallet.id),
        eq(transactions.type, type),
        eq(transactions.amount, p.amount),
        gte(transactions.date, new Date(at.getTime() - DAY)),
        lte(transactions.date, new Date(at.getTime() + DAY)),
      ),
    )
    .limit(1);
  if (lookAlike) return review(p, "Looks like a transaction you already entered");

  await conn.insert(transactions).values({
    userId,
    type,
    amount: p.amount,
    categoryId: await guessCategory(userId, p, conn),
    walletId: wallet.id,
    title: p.title.slice(0, 120),
    date: at,
    source: "email",
    emailId: email.id,
  });
  return { status: "recorded", parsed: p };
}

/** A bank debit and an e-wallet/broker top-up of the same amount within 30 minutes: one transfer. */
async function findPair(conn: Conn, userId: string, email: { id: number; source: FinanceSource }, p: ParsedFinance) {
  const other = p.kind === "topup" ? "transfer_out" : "topup";
  const at = new Date(p.occurredAt).getTime();
  const [row] = await conn
    .select({ id: emails.id })
    .from(emails)
    .where(
      and(
        eq(emails.userId, userId),
        ne(emails.id, email.id),
        eq(emails.financeStatus, "review"),
        ne(emails.financeSource, email.source),
        sql`${emails.parsed}->>'kind' = ${other}`,
        sql`(${emails.parsed}->>'amount')::bigint = ${p.amount}`,
        sql`${emails.parsed}->>'pairEmailId' is null`,
        gte(emails.receivedAt, new Date(at - PAIR_WINDOW)),
        lte(emails.receivedAt, new Date(at + PAIR_WINDOW)),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * After you link a wallet to a source, its waiting "Pick the wallet…" items are filed again
 * (confident ones get recorded now).
 */
export async function refileWaiting(conn: Conn, userId: string, source: FinanceSource): Promise<number> {
  const waiting = await conn
    .select({ id: emails.id, parsed: emails.parsed })
    .from(emails)
    .where(
      and(
        eq(emails.userId, userId),
        eq(emails.financeSource, source),
        eq(emails.financeStatus, "review"),
        sql`${emails.parsed}->>'kind' in ('expense', 'income', 'dividend')`,
      ),
    );
  let recorded = 0;
  for (const w of waiting) {
    if (!w.parsed) continue;
    const { reason: _reason, ...p } = w.parsed;
    if ((await fileFinanceEmail(conn, userId, { id: w.id, source }, p)) === "recorded") recorded++;
  }
  return recorded;
}

export function isFinanceSource(v: unknown): v is FinanceSource {
  return typeof v === "string" && (FINANCE_SOURCES as readonly string[]).includes(v);
}
