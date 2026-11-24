import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  DEBT_CYCLES,
  DEBT_KINDS,
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_SOURCES,
  EMAIL_RULE_KINDS,
  FINANCE_SOURCES,
  FINANCE_STATUSES,
  GMAIL_STATUSES,
  JOB_STAGES,
  NOTE_ICONS,
  STOCK_SYMBOLS,
  TX_SOURCES,
  TX_TYPES,
  WALLET_TYPES,
  WORKOUT_TYPES,
} from "../lib/constants";
import type { ParsedFinance } from "../lib/email/finance/types";
import { user } from "./auth-schema";

export * from "../lib/constants";
export * from "./auth-schema";
export type Exercise = { name: string; sets?: number; reps?: number; weight?: number };

/*
 * Every table belongs to one user (`user_id`), and every query filters by it.
 * Links between a user's rows (transaction → wallet, transfer → wallet, …) use
 * composite foreign keys on (id, user_id), so the database itself refuses a row
 * that points at another user's wallet or category.
 *
 * Money is whole rupiah in bigint (an int would overflow at Rp 2.1 billion).
 * Row-level security is enabled with no policies: on Supabase this blocks the
 * public Data API; the app connects as the table owner and is not affected.
 */

const id = () => integer("id").primaryKey().generatedByDefaultAsIdentity();
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const categories = pgTable(
  "categories",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    type: text("type", { enum: TX_TYPES }).notNull(),
    icon: text("icon").notNull().default("circle"),
  },
  (t) => [
    unique("categories_id_user_unique").on(t.id, t.userId),
    uniqueIndex("categories_user_type_name_unique").on(t.userId, t.type, sql`lower(${t.name})`),
  ],
).enableRLS();

export const wallets = pgTable(
  "wallets",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    type: text("type", { enum: WALLET_TYPES }).notNull().default("bank"),
    /** Balance before tracking started (whole rupiah, may be negative). */
    openingBalance: money("opening_balance").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    /**
     * Set when a wallet with transfers is deleted: it disappears from balances and
     * net worth, but stays so the other wallets' transfer history keeps its name.
     */
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    unique("wallets_id_user_unique").on(t.id, t.userId),
    uniqueIndex("wallets_user_name_unique")
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
).enableRLS();

/** Stocks you hold (one row per ticker), valued at lots × 100 × the live price. Separate from wallets. */
export const stockHoldings = pgTable(
  "stock_holdings",
  {
    id: id(),
    userId: userId(),
    symbol: text("symbol", { enum: STOCK_SYMBOLS }).notNull(),
    lots: integer("lots").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("stock_holdings_user_symbol_unique").on(t.userId, t.symbol),
    check("stock_holdings_lots_nonnegative", sql`${t.lots} >= 0`),
  ],
).enableRLS();

/**
 * Credit cards, online credit (paylater / pinjol), subscriptions… you keep track of.
 * Informational only: they never change wallet balances or net worth, and paying
 * one is recorded as a normal expense from a wallet.
 */
export const debts = pgTable(
  "debts",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: DEBT_KINDS }).notNull(),
    /** What you owe now; for a subscription, its price per cycle. Whole rupiah. */
    amount: money("amount").notNull().default(0),
    /** Credit limit (credit cards, online credit). */
    creditLimit: money("credit_limit"),
    /** Monthly installment / payment (online credit, other). */
    installment: money("installment"),
    /** Subscriptions only; everything else is due monthly. */
    cycle: text("cycle", { enum: DEBT_CYCLES }).notNull().default("monthly"),
    /** Day of the month it's due or renews (1–31; short months use their last day). */
    dueDay: integer("due_day"),
    /** Month a yearly subscription renews (1–12). */
    dueMonth: integer("due_month"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("debts_user_name_unique").on(t.userId, sql`lower(${t.name})`),
    check("debts_amount_nonnegative", sql`${t.amount} >= 0`),
    check("debts_limit_positive", sql`${t.creditLimit} is null or ${t.creditLimit} > 0`),
    check("debts_installment_positive", sql`${t.installment} is null or ${t.installment} > 0`),
    check("debts_due_day_range", sql`${t.dueDay} is null or ${t.dueDay} between 1 and 31`),
    check("debts_due_month_range", sql`${t.dueMonth} is null or ${t.dueMonth} between 1 and 12`),
  ],
).enableRLS();

/** Last good price per ticker (shared by all users), used when Yahoo can't be reached. */
export const stockPrices = pgTable("stock_prices", {
  symbol: text("symbol", { enum: STOCK_SYMBOLS }).primaryKey(),
  price: doublePrecision("price").notNull(),
  prevClose: doublePrecision("prev_close"),
  marketTime: ts("market_time").notNull(),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
}).enableRLS();

/** The linked Gmail inbox (one per user). Tokens are encrypted (src/lib/gmail/crypto.ts). */
export const gmailAccounts = pgTable(
  "gmail_accounts",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    refreshToken: text("refresh_token").notNull(),
    accessToken: text("access_token"),
    accessExpiresAt: ts("access_expires_at"),
    scope: text("scope").notNull(),
    /** reauth = Google refused the token (revoked / expired); the Email page asks to reconnect. */
    status: text("status", { enum: GMAIL_STATUSES }).notNull().default("ok"),
    /** The first sync pulls the last 60 days in chunks; these remember where it stopped. */
    backfillSince: ts("backfill_since").notNull(),
    backfillPageToken: text("backfill_page_token"),
    backfillDone: boolean("backfill_done").notNull().default(false),
    lastSyncAt: ts("last_sync_at"),
    /** Lock so two tabs don't sync the same inbox at once (stale after 2 minutes). */
    syncStartedAt: ts("sync_started_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("gmail_accounts_address_unique").on(sql`lower(${t.address})`)],
).enableRLS();

export const emails = pgTable(
  "emails",
  {
    id: id(),
    userId: userId(),
    /** Gmail message id; "mock-…" for sample data. */
    providerId: text("provider_id").notNull(),
    fromName: text("from_name").notNull(),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull().default(""),
    receivedAt: ts("received_at").notNull(),
    category: text("category", { enum: EMAIL_CATEGORIES }).notNull(),
    categorySource: text("category_source", { enum: EMAIL_CATEGORY_SOURCES }).notNull().default("auto"),
    jobStage: text("job_stage", { enum: JOB_STAGES }),
    /** Gmail labels and "sent in bulk" (List-Unsubscribe / Precedence), kept so emails can be re-categorized. */
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    bulk: boolean("bulk").notNull().default(false),
    /** Which bank/e-wallet parser read it (null = not a transaction sender). */
    financeSource: text("finance_source", { enum: FINANCE_SOURCES }),
    financeStatus: text("finance_status", { enum: FINANCE_STATUSES }).notNull().default("none"),
    parsed: jsonb("parsed").$type<ParsedFinance>(),
    /** Plain text of the email, stored only for finance senders (max 8 KB) so parsers can re-run. */
    bodyText: text("body_text"),
    /** When the finance parser handled this email. */
    processedAt: ts("processed_at"),
  },
  (t) => [
    unique("emails_id_user_unique").on(t.id, t.userId),
    unique("emails_user_provider_unique").on(t.userId, t.providerId),
    index("emails_user_received_idx").on(t.userId, t.receivedAt),
  ],
).enableRLS();

/** "Always put emails from X in category Y". X is a lowercase address or domain. */
export const emailRules = pgTable(
  "email_rules",
  {
    id: id(),
    userId: userId(),
    kind: text("kind", { enum: EMAIL_RULE_KINDS }).notNull(),
    pattern: text("pattern").notNull(),
    category: text("category", { enum: EMAIL_CATEGORIES }).notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_rules_user_kind_pattern_unique").on(t.userId, t.kind, t.pattern)],
).enableRLS();

/** Which wallet a bank/e-wallet's emails are recorded into. */
export const emailWalletLinks = pgTable(
  "email_wallet_links",
  {
    userId: userId(),
    source: text("source", { enum: FINANCE_SOURCES }).notNull(),
    walletId: integer("wallet_id").notNull(),
  },
  (t) => [
    primaryKey({ name: "email_wallet_links_pk", columns: [t.userId, t.source] }),
    foreignKey({
      name: "email_wallet_links_wallet_fk",
      columns: [t.walletId, t.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }).onDelete("cascade"),
  ],
).enableRLS();

/** Money moved between two wallets — changes balances, never counts as income or expense. */
export const transfers = pgTable(
  "transfers",
  {
    id: id(),
    userId: userId(),
    fromWalletId: integer("from_wallet_id").notNull(),
    toWalletId: integer("to_wallet_id").notNull(),
    amount: money("amount").notNull(),
    date: ts("date").notNull(),
    note: text("note"),
    /** Set when the transfer was recorded from an email (e.g. a top-up). */
    emailId: integer("email_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("transfers_user_date_idx").on(t.userId, t.date),
    foreignKey({
      name: "transfers_email_fk",
      columns: [t.emailId, t.userId],
      foreignColumns: [emails.id, emails.userId],
    }),
    foreignKey({
      name: "transfers_from_wallet_fk",
      columns: [t.fromWalletId, t.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: "transfers_to_wallet_fk",
      columns: [t.toWalletId, t.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
  ],
).enableRLS();

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: userId(),
    type: text("type", { enum: TX_TYPES }).notNull(),
    /** Whole rupiah. */
    amount: money("amount").notNull(),
    /** Null = "Uncategorized" (e.g. after its category was deleted). */
    categoryId: integer("category_id"),
    walletId: integer("wallet_id").notNull(),
    title: text("title").notNull(),
    note: text("note"),
    date: ts("date").notNull(),
    source: text("source", { enum: TX_SOURCES }).notNull().default("manual"),
    /** Set when the transaction was recorded from an email. */
    emailId: integer("email_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    foreignKey({
      name: "transactions_wallet_fk",
      columns: [t.walletId, t.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: "transactions_category_fk",
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    foreignKey({
      name: "transactions_email_fk",
      columns: [t.emailId, t.userId],
      foreignColumns: [emails.id, emails.userId],
    }),
  ],
).enableRLS();

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    userId: userId(),
    /** YYYY-MM */
    month: text("month").notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [unique("budgets_user_month_unique").on(t.userId, t.month)],
).enableRLS();

export const notes = pgTable(
  "notes",
  {
    id: id(),
    userId: userId(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    /** One of NOTE_ICONS; null = show the title's first letter. Also groups notes for filtering. */
    icon: text("icon", { enum: NOTE_ICONS }),
    tags: text("tags"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("notes_user_idx").on(t.userId), unique("notes_id_user_unique").on(t.id, t.userId)],
).enableRLS();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Images in notes (dropped, pasted or picked), served at /api/notes/images/<id> to their
 * owner only. They belong to the user, not one note, so an image copied into another note
 * keeps working. Images no note links to any more are removed a day later (undo still works meanwhile).
 */
export const noteImages = pgTable(
  "note_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    size: integer("size").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("note_images_user_idx").on(t.userId, t.createdAt)],
).enableRLS();

/** Weekly plan: a session that repeats every week on `day_of_week` at `start_min`. A day can hold several. */
export const workoutSchedule = pgTable(
  "workout_schedule",
  {
    id: id(),
    userId: userId(),
    /** 0 = Monday … 6 = Sunday */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Start, in minutes after midnight (wall-clock time in the user's timezone). */
    startMin: integer("start_min").notNull(),
    type: text("type", { enum: WORKOUT_TYPES }).notNull(),
    title: text("title").notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    /** The plan shows (and can be missed) from this day on, not in weeks before it existed. */
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("workout_schedule_user_day_idx").on(t.userId, t.dayOfWeek),
    check("workout_schedule_start_range", sql`${t.startMin} between 0 and 1439`),
    check("workout_schedule_ends_same_day", sql`${t.startMin} + ${t.durationMin} <= 1440`),
  ],
).enableRLS();

export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: id(),
    userId: userId(),
    /** When the session started (its time of day is shown on the calendar). */
    date: ts("date").notNull(),
    type: text("type", { enum: WORKOUT_TYPES }).notNull(),
    title: text("title").notNull(),
    durationMin: integer("duration_min").notNull(),
    exercises: jsonb("exercises").$type<Exercise[]>().notNull().default([]),
    notes: text("notes"),
    /** Soft link to the weekly plan this session fulfilled (no FK: the plan may be deleted later). */
    scheduleId: integer("schedule_id"),
  },
  (t) => [index("workout_logs_user_date_idx").on(t.userId, t.date)],
).enableRLS();

export type User = typeof user.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type StockHolding = typeof stockHoldings.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteImage = typeof noteImages.$inferSelect;
export type WorkoutScheduleRow = typeof workoutSchedule.$inferSelect;
export type WorkoutLog = typeof workoutLogs.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type GmailAccount = typeof gmailAccounts.$inferSelect;
export type EmailRule = typeof emailRules.$inferSelect;
