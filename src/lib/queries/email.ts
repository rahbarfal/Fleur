import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { addDays, format, startOfDay } from "date-fns";
import { db } from "@/db";
import { categories, emailRules, emails, gmailAccounts, transactions, transfers, wallets } from "@/db/schema";
import { countAll, localPart, sumWhere } from "@/db/sql";
import {
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_LABEL,
  FINANCE_SOURCE_LABEL,
  FINANCE_SOURCES,
  type EmailRuleKind,
  type EmailCategory,
  type EmailCategorySource,
  type FinanceSource,
  type JobStage,
} from "@/lib/constants";
import { periodRange, timeAgo, zoned, type Period } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import { pickCategory, sourceWallets } from "@/lib/email/finance/record";
import type { FinanceKind, ParsedFinance } from "@/lib/email/finance/types";
import { gmailConfigured } from "@/lib/gmail/oauth";
import type { Viewer } from "@/lib/viewer";

/* ------------------------------------------------------------------ Gmail link status */

export type GmailStatus = {
  /** GOOGLE_CLIENT_ID / SECRET / GMAIL_TOKEN_KEY are set on the server. */
  configured: boolean;
  /** A "Try the demo" sandbox: Email isn't part of the demo, so linking is off. */
  demo: boolean;
  linked: boolean;
  address: string | null;
  /** reauth = Google refused the token; show "Reconnect Gmail". */
  needsReconnect: boolean;
  linkedLabel: string | null;
  lastSyncAt: number | null;
  lastSyncAgo: string | null;
  backfillDone: boolean;
  lastError: string | null;
  emailCount: number;
};

export async function getGmailStatus(v: Viewer): Promise<GmailStatus> {
  const [[acc], emailCount] = await Promise.all([
    db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, v.id)),
    db.$count(emails, eq(emails.userId, v.id)),
  ]);
  return {
    configured: gmailConfigured(),
    demo: v.isDemo,
    linked: Boolean(acc),
    address: acc?.address ?? null,
    needsReconnect: acc?.status === "reauth",
    linkedLabel: acc ? format(zoned(acc.createdAt, v.tz), "d MMM yyyy") : null,
    lastSyncAt: acc?.lastSyncAt?.getTime() ?? null,
    lastSyncAgo: acc?.lastSyncAt ? timeAgo(acc.lastSyncAt) : null,
    backfillDone: acc?.backfillDone ?? false,
    lastError: acc?.lastError ?? null,
    emailCount,
  };
}

/* ------------------------------------------------------------------ Inbox */

export type EmailFinanceView = {
  status: "recorded" | "review" | "ignored";
  kind: FinanceKind;
  amount: number;
  /** "GoPay" / "BCA → GoPay" once recorded. */
  walletLabel: string | null;
};

export type EmailView = {
  id: number;
  providerId: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  category: EmailCategory;
  categorySource: EmailCategorySource;
  jobStage: JobStage | null;
  finance: EmailFinanceView | null;
  /** Opens the message in Gmail (null for sample data). */
  gmailUrl: string | null;
  timeLabel: string;
  ago: string;
};

/** A parsed bank / e-wallet / broker email waiting for you, with the form pre-filled. */
export type ReviewItem = {
  emailId: number;
  /** The paired top-up/debit email, recorded or ignored together. */
  pairEmailId: number | null;
  source: FinanceSource;
  sourceLabel: string;
  kind: FinanceKind;
  amount: number;
  title: string;
  counterparty: string | null;
  reason: string;
  subject: string;
  fromName: string;
  ago: string;
  /** "yyyy-MM-ddTHH:mm" in your timezone, for the form. */
  dateInput: string;
  stock: ParsedFinance["stock"] | null;
  suggest: {
    mode: "expense" | "income" | "transfer" | "trade";
    walletId: number | null;
    fromWalletId: number | null;
    toWalletId: number | null;
    categoryId: number | null;
    /** The source whose wallet "Use this wallet for all … emails" remembers. */
    rememberSource: FinanceSource;
    rememberLabel: string;
  };
};

const gmailUrl = (address: string | null, providerId: string) =>
  address && !providerId.startsWith("mock-")
    ? `https://mail.google.com/mail/u/${encodeURIComponent(address)}/#all/${encodeURIComponent(providerId)}`
    : null;

export async function getEmailDigest(v: Viewer, period: Period, now: Date) {
  const { start, end, prevStart, prevEnd } = periodRange(period, now);
  const inRange = (from: Date, to: Date) => and(eq(emails.userId, v.id), gte(emails.receivedAt, from), lt(emails.receivedAt, to));

  const counts = (from: Date, to: Date) =>
    db.select({ category: emails.category, count: countAll() }).from(emails).where(inRange(from, to)).groupBy(emails.category);

  const [current, previous, rows, stages, gmail] = await Promise.all([
    counts(start, end),
    counts(prevStart, prevEnd),
    db.select().from(emails).where(inRange(start, end)).orderBy(desc(emails.receivedAt)).limit(500),
    db
      .select({ stage: emails.jobStage, count: countAll() })
      .from(emails)
      .where(and(inRange(start, end), eq(emails.category, "jobseek")))
      .groupBy(emails.jobStage),
    getGmailStatus(v),
  ]);
  const total = current.reduce((s, r) => s + r.count, 0);
  const prevTotal = previous.reduce((s, r) => s + r.count, 0);
  const countOf = (c: EmailCategory) => current.find((r) => r.category === c)?.count ?? 0;

  // Always all six, in your order (Job search first).
  const byCategory = EMAIL_CATEGORIES.map((c) => ({ category: c, label: EMAIL_CATEGORY_LABEL[c], count: countOf(c) }));
  const top3 = [...byCategory].filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  const stageCount = (s: JobStage) => stages.find((r) => r.stage === s)?.count ?? 0;

  const recorded = await recordedLabels(v.id, rows.filter((e) => e.financeStatus === "recorded").map((e) => e.id));
  const list: EmailView[] = rows.map((e) => ({
    id: e.id,
    providerId: e.providerId,
    fromName: e.fromName,
    fromAddress: e.fromAddress,
    subject: e.subject,
    snippet: e.snippet,
    category: e.category,
    categorySource: e.categorySource,
    jobStage: e.jobStage,
    finance:
      e.parsed && e.financeStatus !== "none"
        ? { status: e.financeStatus, kind: e.parsed.kind, amount: e.parsed.amount, walletLabel: recorded.get(e.id) ?? null }
        : null,
    gmailUrl: gmailUrl(gmail.address, e.providerId),
    timeLabel: format(zoned(e.receivedAt, v.tz), period === "daily" ? "HH:mm" : "d MMM, HH:mm"),
    ago: timeAgo(e.receivedAt),
  }));

  return {
    period,
    total,
    change: pctChange(total, prevTotal),
    byCategory,
    top3,
    financialCount: countOf("finance"),
    jobseekCount: countOf("jobseek"),
    interviews: stageCount("interview"),
    offers: stageCount("offer"),
    list,
    review: await getReviewItems(v),
    gmail,
  };
}

/** "GoPay" for a recorded transaction, "BCA → GoPay" for a recorded transfer. */
async function recordedLabels(userId: string, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const from = alias(wallets, "from_wallet");
  const to = alias(wallets, "to_wallet");
  const [txs, trs] = await Promise.all([
    db
      .select({ emailId: transactions.emailId, wallet: wallets.name })
      .from(transactions)
      .innerJoin(wallets, and(eq(wallets.id, transactions.walletId), eq(wallets.userId, transactions.userId)))
      .where(and(eq(transactions.userId, userId), inArray(transactions.emailId, ids))),
    db
      .select({ emailId: transfers.emailId, from: from.name, to: to.name })
      .from(transfers)
      .innerJoin(from, and(eq(from.id, transfers.fromWalletId), eq(from.userId, transfers.userId)))
      .innerJoin(to, and(eq(to.id, transfers.toWalletId), eq(to.userId, transfers.userId)))
      .where(and(eq(transfers.userId, userId), inArray(transfers.emailId, ids))),
  ]);
  for (const t of txs) if (t.emailId) out.set(t.emailId, t.wallet);
  for (const t of trs) if (t.emailId) out.set(t.emailId, `${t.from} → ${t.to}`);
  return out;
}

/** Everything waiting in "To review" (any date), a paired top-up + debit shown once. */
export async function getReviewItems(v: Viewer): Promise<ReviewItem[]> {
  const rows = await db
    .select()
    .from(emails)
    .where(and(eq(emails.userId, v.id), eq(emails.financeStatus, "review")))
    .orderBy(desc(emails.receivedAt))
    .limit(60);
  if (!rows.length) return [];
  const [walletOf, cats] = await Promise.all([
    sourceWallets(v.id),
    db.select({ id: categories.id, name: categories.name, type: categories.type }).from(categories).where(eq(categories.userId, v.id)),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<number>();
  const items: ReviewItem[] = [];

  for (const e of rows) {
    const p = e.parsed;
    if (!p || !e.financeSource || seen.has(e.id)) continue;
    seen.add(e.id);
    const pair = p.pairEmailId ? byId.get(p.pairEmailId) : undefined;
    if (pair) seen.add(pair.id);

    const source = e.financeSource;
    const own = walletOf[source]?.id ?? null;
    let suggest: ReviewItem["suggest"];
    if (p.kind === "trade") {
      suggest = { mode: "trade", walletId: null, fromWalletId: null, toWalletId: null, categoryId: null, rememberSource: source, rememberLabel: FINANCE_SOURCE_LABEL[source] };
    } else if (p.kind === "topup" || p.kind === "transfer_out") {
      // Money moved out of the debit side's wallet into the top-up side's wallet.
      const debit = p.kind === "transfer_out" ? e : pair;
      const credit = p.kind === "topup" ? e : pair;
      const remember = (credit ?? debit ?? e).financeSource ?? source;
      suggest = {
        mode: "transfer",
        walletId: null,
        fromWalletId: debit?.financeSource ? (walletOf[debit.financeSource]?.id ?? null) : null,
        toWalletId: credit?.financeSource ? (walletOf[credit.financeSource]?.id ?? null) : null,
        categoryId: null,
        rememberSource: remember,
        rememberLabel: FINANCE_SOURCE_LABEL[remember],
      };
    } else {
      const type = p.kind === "expense" ? "expense" : "income";
      suggest = {
        mode: type,
        walletId: own,
        fromWalletId: null,
        toWalletId: null,
        categoryId: pickCategory(cats.filter((c) => c.type === type), p),
        rememberSource: source,
        rememberLabel: FINANCE_SOURCE_LABEL[source],
      };
    }

    items.push({
      emailId: e.id,
      pairEmailId: pair?.id ?? null,
      source,
      sourceLabel: pair?.financeSource ? `${FINANCE_SOURCE_LABEL[source]} + ${FINANCE_SOURCE_LABEL[pair.financeSource]}` : FINANCE_SOURCE_LABEL[source],
      kind: p.kind,
      amount: p.amount,
      title: p.title,
      counterparty: p.counterparty,
      reason: p.reason ?? "Check the details",
      subject: e.subject,
      fromName: e.fromName,
      ago: timeAgo(e.receivedAt),
      dateInput: format(zoned(new Date(p.occurredAt), v.tz), "yyyy-MM-dd'T'HH:mm"),
      stock: p.stock ?? null,
      suggest,
    });
  }
  return items;
}

/* ------------------------------------------------------------------ Rules dialog */

export type EmailSettings = {
  rules: { id: number; kind: EmailRuleKind; pattern: string; category: EmailCategory }[];
  /** Which wallet each bank's emails are recorded into (linked = you picked it; else guessed from the wallet name). */
  wallets: { source: FinanceSource; label: string; walletName: string | null; linked: boolean }[];
};

export async function getEmailSettings(v: Viewer): Promise<EmailSettings> {
  const [rules, walletOf] = await Promise.all([
    db
      .select({ id: emailRules.id, kind: emailRules.kind, pattern: emailRules.pattern, category: emailRules.category })
      .from(emailRules)
      .where(eq(emailRules.userId, v.id))
      .orderBy(emailRules.pattern),
    sourceWallets(v.id),
  ]);
  return {
    rules,
    wallets: FINANCE_SOURCES.map((source) => ({
      source,
      label: FINANCE_SOURCE_LABEL[source],
      walletName: walletOf[source]?.name ?? null,
      linked: walletOf[source]?.linked ?? false,
    })),
  };
}

/** For the navbar: is a working Gmail link there? */
export async function isGmailLinked(v: Viewer): Promise<boolean> {
  const [acc] = await db.select({ status: gmailAccounts.status }).from(gmailAccounts).where(eq(gmailAccounts.userId, v.id));
  return acc?.status === "ok";
}

/* ------------------------------------------------------------------ Volume */

/** Emails per day for the last `days` days (oldest first), for the volume chart. */
export async function getEmailVolume(v: Viewer, days: number, now: Date) {
  const start = startOfDay(addDays(now, -(days - 1)));
  const rows = await db
    .select({
      day: localPart(emails.receivedAt, v.tz, "YYYY-MM-DD"),
      count: countAll(),
      jobseek: sumWhere(sql`1`, eq(emails.category, "jobseek")),
      finance: sumWhere(sql`1`, eq(emails.category, "finance")),
    })
    .from(emails)
    .where(and(eq(emails.userId, v.id), gte(emails.receivedAt, start)))
    .groupBy(sql`1`);

  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    const key = format(d, "yyyy-MM-dd");
    const r = rows.find((x) => x.day === key);
    return {
      key,
      weekday: format(d, "EEE"),
      day: format(d, "d"),
      label: format(d, "EEEE, d MMM"),
      count: r?.count ?? 0,
      jobseek: r?.jobseek ?? 0,
      finance: r?.finance ?? 0,
      isToday: i === days - 1,
    };
  });
}

export { EMAIL_CATEGORY_LABEL };
