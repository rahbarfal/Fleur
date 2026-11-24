import "server-only";
import { and, eq, inArray, isNull, lt, max, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { emailRules, emails, gmailAccounts, type GmailAccount } from "@/db/schema";
import { classify, ownDomainOf, type ClassifyContext } from "@/lib/email/classify";
import { decodeEntities, financeSourceOf, htmlToText } from "@/lib/email/finance/common";
import { parseFinanceEmail, type ParsedFinance } from "@/lib/email/finance";
import { fileFinanceEmail } from "@/lib/email/finance/record";
import type { FinanceSource } from "@/lib/constants";
import { bodyOf, gmailClient, header, parseFrom, pool, type GmailMessage } from "./api";
import { GoogleAuthError } from "./oauth";

/*
 * Pulls new mail into `emails`:
 *   - first link: the last 60 days (max 1,500 messages), newest first, in chunks
 *     that resume where they stopped if a run runs out of time
 *   - after that: everything since the newest stored email (minus a day of overlap)
 * Each message: metadata only (sender, subject, preview, Gmail tab), categorized;
 * bank / e-wallet / broker mail also gets its text read and is filed as a transaction.
 */

export const BACKFILL_DAYS = 60;
const BACKFILL_CAP = 1500;
const QUERY_TAIL = "-in:sent -in:draft -in:chats";
const LOCK_STALE_MS = 2 * 60_000;
const BODY_MAX = 8000;

export type SyncResult = {
  status: "ok" | "skipped" | "reauth" | "error" | "unlinked";
  added: number;
  recorded: number;
  review: number;
  error?: string;
};

type Counts = { added: number; recorded: number; review: number };

export async function syncGmail(userId: string, budgetMs = 40_000): Promise<SyncResult> {
  const counts: Counts = { added: 0, recorded: 0, review: 0 };
  const now = Date.now();
  const [acc] = await db
    .update(gmailAccounts)
    .set({ syncStartedAt: new Date(now) })
    .where(
      and(
        eq(gmailAccounts.userId, userId),
        eq(gmailAccounts.status, "ok"),
        or(isNull(gmailAccounts.syncStartedAt), lt(gmailAccounts.syncStartedAt, new Date(now - LOCK_STALE_MS))),
      ),
    )
    .returning();
  if (!acc) {
    const [row] = await db.select({ status: gmailAccounts.status }).from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
    return { ...counts, status: !row ? "unlinked" : row.status === "reauth" ? "reauth" : "skipped" };
  }

  const deadline = now + budgetMs;
  try {
    const rules = await db
      .select({ kind: emailRules.kind, pattern: emailRules.pattern, category: emailRules.category })
      .from(emailRules)
      .where(eq(emailRules.userId, userId));
    const ctx: ClassifyContext = { rules, ownDomain: ownDomainOf(acc.address) };
    const gmail = gmailClient(acc);
    const wasBackfilled = acc.backfillDone;

    if (!acc.backfillDone) await backfill(acc, gmail, ctx, deadline, counts);
    if (wasBackfilled && Date.now() < deadline) await incremental(acc, gmail, ctx, deadline, counts);

    await db
      .update(gmailAccounts)
      .set({ lastSyncAt: new Date(), syncStartedAt: null, lastError: null })
      .where(eq(gmailAccounts.userId, userId));
    return { ...counts, status: "ok" };
  } catch (err) {
    const reauth = err instanceof GoogleAuthError;
    const message = err instanceof Error ? err.message.slice(0, 300) : "Sync failed";
    if (!reauth) console.error("Gmail sync failed", err);
    await db
      .update(gmailAccounts)
      .set({ syncStartedAt: null, lastError: message, ...(reauth ? { status: "reauth" as const } : {}) })
      .where(eq(gmailAccounts.userId, userId));
    return { ...counts, status: reauth ? "reauth" : "error", error: message };
  }
}

type Gmail = ReturnType<typeof gmailClient>;
const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

async function backfill(acc: GmailAccount, gmail: Gmail, ctx: ClassifyContext, deadline: number, counts: Counts) {
  const q = `after:${epoch(acc.backfillSince)} ${QUERY_TAIL}`;
  let token = acc.backfillPageToken ?? undefined;
  while (Date.now() < deadline) {
    let page;
    try {
      page = await gmail.list(q, token);
    } catch (err) {
      // An old page token can expire; start over (already stored messages are skipped).
      if (token && err instanceof Error && /\(400\)/.test(err.message)) {
        token = undefined;
        continue;
      }
      throw err;
    }
    await processIds(acc, gmail, ctx, (page.messages ?? []).map((m) => m.id), counts);
    token = page.nextPageToken;
    const n = await db.$count(emails, eq(emails.userId, acc.userId));
    const done = !token || n >= BACKFILL_CAP;
    await db
      .update(gmailAccounts)
      .set({ backfillPageToken: done ? null : token, backfillDone: done })
      .where(eq(gmailAccounts.userId, acc.userId));
    if (done) return;
  }
}

async function incremental(acc: GmailAccount, gmail: Gmail, ctx: ClassifyContext, deadline: number, counts: Counts) {
  const [{ newest }] = await db
    .select({ newest: max(emails.receivedAt) })
    .from(emails)
    .where(eq(emails.userId, acc.userId));
  const since = new Date((newest ?? acc.backfillSince).getTime() - 86_400_000);
  const q = `after:${epoch(since)} ${QUERY_TAIL}`;
  let token: string | undefined;
  for (let pages = 0; pages < 5 && Date.now() < deadline; pages++) {
    const page = await gmail.list(q, token);
    await processIds(acc, gmail, ctx, (page.messages ?? []).map((m) => m.id), counts);
    token = page.nextPageToken;
    if (!token) return;
  }
}

type NewEmail = typeof emails.$inferInsert & { _source: FinanceSource | null; _parsed: ParsedFinance | null };

async function processIds(acc: GmailAccount, gmail: Gmail, ctx: ClassifyContext, ids: string[], counts: Counts) {
  if (!ids.length) return;
  const known = await db
    .select({ id: emails.providerId })
    .from(emails)
    .where(and(eq(emails.userId, acc.userId), inArray(emails.providerId, ids)));
  const knownSet = new Set(known.map((k) => k.id));
  const fresh = ids.filter((id) => !knownSet.has(id));
  if (!fresh.length) return;

  const messages = await pool(fresh, 8, (id) => gmail.metadata(id));
  const rows = await pool(messages, 4, (m) => toRow(acc, gmail, ctx, m));

  const inserted = await db
    .insert(emails)
    .values(rows.map(({ _source: _s, _parsed: _p, ...r }) => r))
    .onConflictDoNothing({ target: [emails.userId, emails.providerId] })
    .returning({ id: emails.id, providerId: emails.providerId });
  counts.added += inserted.length;

  // File transactions oldest first, so a top-up finds the bank debit that came just before it.
  const byProvider = new Map(rows.map((r) => [r.providerId, r]));
  const toFile = inserted
    .map((i) => ({ ...i, row: byProvider.get(i.providerId)! }))
    .filter((i) => i.row._source && i.row._parsed)
    .sort((a, b) => a.row.receivedAt.getTime() - b.row.receivedAt.getTime());
  for (const i of toFile) {
    const status = await db.transaction((tx) =>
      fileFinanceEmail(tx, acc.userId, { id: i.id, source: i.row._source! }, i.row._parsed),
    );
    if (status === "recorded") counts.recorded++;
    if (status === "review") counts.review++;
  }
}

async function toRow(acc: GmailAccount, gmail: Gmail, ctx: ClassifyContext, m: GmailMessage): Promise<NewEmail> {
  const from = parseFrom(header(m, "From"));
  const subject = header(m, "Subject").trim() || "(no subject)";
  const snippet = decodeEntities(m.snippet ?? "").slice(0, 300);
  const labels = (m.labelIds ?? []).filter((l) => l.startsWith("CATEGORY_"));
  const bulk = Boolean(header(m, "List-Unsubscribe")) || /bulk|list|junk/i.test(header(m, "Precedence"));
  const receivedAt = new Date(Number(m.internalDate ?? Date.now()));
  const c = classify({ fromAddress: from.address, fromName: from.name, subject, snippet, labels, bulk }, ctx);

  // Bank / e-wallet / broker mail that isn't an advert: read the text and look for a transaction.
  const source = financeSourceOf(from.address);
  let bodyText: string | null = null;
  let parsed: ParsedFinance | null = null;
  if (source && c.category === "finance") {
    const full = await gmail.full(m.id);
    const { text, html } = bodyOf(full.payload);
    bodyText = (text.trim() ? text : htmlToText(html)).slice(0, BODY_MAX);
    parsed = parseFinanceEmail(source, { fromAddress: from.address, subject, text: bodyText, receivedAt });
  }

  return {
    userId: acc.userId,
    providerId: m.id,
    fromName: from.name.slice(0, 120),
    fromAddress: from.address.slice(0, 200),
    subject: subject.slice(0, 300),
    snippet,
    receivedAt,
    category: c.category,
    categorySource: c.source,
    jobStage: c.jobStage,
    labels,
    bulk,
    financeSource: source && c.category === "finance" ? source : null,
    financeStatus: "none",
    bodyText,
    _source: source && c.category === "finance" ? source : null,
    _parsed: parsed,
  };
}

/** Re-categorizes your emails after a rule changed (emails you moved by hand stay put). */
export async function reclassifyAll(userId: string): Promise<number> {
  const [acc] = await db.select({ address: gmailAccounts.address }).from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  const rules = await db
    .select({ kind: emailRules.kind, pattern: emailRules.pattern, category: emailRules.category })
    .from(emailRules)
    .where(eq(emailRules.userId, userId));
  const ctx: ClassifyContext = { rules, ownDomain: ownDomainOf(acc?.address) };
  const rows = await db
    .select()
    .from(emails)
    .where(and(eq(emails.userId, userId), ne(emails.categorySource, "manual")));

  const groups = new Map<string, number[]>();
  for (const e of rows) {
    const c = classify(e, ctx);
    if (c.category === e.category && c.source === e.categorySource && c.jobStage === e.jobStage) continue;
    const key = JSON.stringify([c.category, c.source, c.jobStage]);
    groups.set(key, [...(groups.get(key) ?? []), e.id]);
  }
  for (const [key, ids] of groups) {
    const [category, source, jobStage] = JSON.parse(key) as [typeof emails.$inferSelect.category, "auto" | "rule", typeof emails.$inferSelect.jobStage];
    await db
      .update(emails)
      .set({ category, categorySource: source, jobStage })
      .where(and(eq(emails.userId, userId), inArray(emails.id, ids)));
  }
  return [...groups.values()].reduce((s, ids) => s + ids.length, 0);
}
