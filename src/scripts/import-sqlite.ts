/**
 * One-time copy of the old SQLite database (data/fleur.db) into one user's account.
 *
 *   npm run db:import-sqlite -- --email you@example.com [--file data/fleur.db] [--yes]
 *
 * - Reads SQLite read-only with Node's built-in node:sqlite; the file isn't changed.
 * - Everything is inserted in one Postgres transaction: all or nothing.
 * - Old ids are remapped (via each table's natural key), so it is safe on a
 *   database that already has other users.
 * - Refuses to run if the account already has data.
 */
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { count, eq } from "drizzle-orm";
import {
  budgets,
  categories,
  emails,
  notes,
  transactions,
  transfers,
  wallets,
  workoutLogs,
  workoutSchedule,
  type Exercise,
} from "../db/schema";
import type { EmailCategory, TxType, WalletType, WorkoutType } from "../lib/constants";
import { args, confirm, db, die, findUser, run } from "./_cli";

type Row = Record<string, unknown>;
const ms = (v: unknown) => new Date(Number(v));
const msOrNull = (v: unknown) => (v === null || v === undefined ? null : new Date(Number(v)));
const num = (v: unknown) => Number(v);
const str = (v: unknown) => String(v);
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));

function chunks<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

run(async () => {
  const a = args({ email: { type: "string" }, file: { type: "string" }, yes: { type: "boolean" } });
  const file = a.file ?? "data/fleur.db";
  if (!fs.existsSync(file)) die(`SQLite file not found: ${file}`);
  const u = await findUser(a.email);
  const userId = u.id;

  // Refuse to mix into an account that already has data.
  const tables = [categories, wallets, transactions, transfers, budgets, notes, workoutSchedule, workoutLogs, emails];
  for (const t of tables) {
    const [{ n }] = await db.select({ n: count() }).from(t).where(eq(t.userId, userId));
    if (n > 0) die(`${u.email} already has data. The import only runs into an empty account.`);
  }

  const sqlite = new DatabaseSync(file, { readOnly: true });
  const all = (table: string) => sqlite.prepare(`select * from ${table} order by id`).all() as Row[];
  const src = {
    categories: all("categories"),
    wallets: all("wallets"),
    emails: all("emails"),
    transactions: all("transactions"),
    transfers: all("transfers"),
    budgets: all("budgets"),
    notes: all("notes"),
    workoutSchedule: all("workout_schedule"),
    workoutLogs: all("workout_logs"),
  };
  sqlite.close();

  console.log(`\nFrom ${file}:`);
  console.table(Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.length])));
  if (!(await confirm(`Copy all of this into ${u.name} <${u.email}>?`, a.yes))) return console.log("Cancelled.");

  const counts = await db.transaction(async (tx) => {
    // ---- categories (natural key: type + name)
    const catIds = new Map<number, number>();
    if (src.categories.length) {
      const inserted = await tx
        .insert(categories)
        .values(src.categories.map((c) => ({ userId, name: str(c.name), type: str(c.type) as TxType, icon: str(c.icon) })))
        .returning({ id: categories.id, name: categories.name, type: categories.type });
      for (const c of src.categories) {
        const hit = inserted.find((r) => r.name === str(c.name) && r.type === str(c.type));
        if (hit) catIds.set(num(c.id), hit.id);
      }
    }

    // ---- wallets (natural key: name)
    const walletIds = new Map<number, number>();
    if (src.wallets.length) {
      const inserted = await tx
        .insert(wallets)
        .values(
          src.wallets.map((w) => ({
            userId,
            name: str(w.name),
            type: str(w.type) as WalletType,
            openingBalance: num(w.opening_balance),
            sortOrder: num(w.sort_order),
            createdAt: ms(w.created_at),
          })),
        )
        .returning({ id: wallets.id, name: wallets.name });
      for (const w of src.wallets) {
        const hit = inserted.find((r) => r.name === str(w.name));
        if (hit) walletIds.set(num(w.id), hit.id);
      }
    }
    const wallet = (old: unknown, what: string) => {
      const id = walletIds.get(num(old));
      if (!id) throw new Error(`${what} points at wallet ${String(old)}, which doesn't exist in the SQLite file.`);
      return id;
    };

    // ---- emails (natural key: provider_id)
    const emailIds = new Map<number, number>();
    for (const part of chunks(src.emails)) {
      const inserted = await tx
        .insert(emails)
        .values(
          part.map((e) => ({
            userId,
            providerId: str(e.provider_id),
            fromName: str(e.from_name),
            fromAddress: str(e.from_address),
            subject: str(e.subject),
            snippet: str(e.snippet),
            receivedAt: ms(e.received_at),
            // The old "promotions" category is part of Social now.
            category: (str(e.category) === "promotions" ? "social" : str(e.category)) as EmailCategory,
            processedAt: msOrNull(e.processed_at),
          })),
        )
        .returning({ id: emails.id, providerId: emails.providerId });
      const byProvider = new Map(inserted.map((r) => [r.providerId, r.id]));
      for (const e of part) emailIds.set(num(e.id), byProvider.get(str(e.provider_id))!);
    }

    // ---- transactions
    for (const part of chunks(src.transactions)) {
      await tx.insert(transactions).values(
        part.map((t) => ({
          userId,
          type: str(t.type) as TxType,
          amount: num(t.amount),
          categoryId: t.category_id === null ? null : (catIds.get(num(t.category_id)) ?? null),
          walletId: wallet(t.wallet_id, `Transaction ${String(t.id)}`),
          title: str(t.title),
          note: strOrNull(t.note),
          date: ms(t.date),
          source: str(t.source) as "manual" | "email",
          emailId: t.email_id === null ? null : (emailIds.get(num(t.email_id)) ?? null),
          createdAt: ms(t.created_at),
        })),
      );
    }

    // ---- transfers
    for (const part of chunks(src.transfers)) {
      await tx.insert(transfers).values(
        part.map((t) => ({
          userId,
          fromWalletId: wallet(t.from_wallet_id, `Transfer ${String(t.id)}`),
          toWalletId: wallet(t.to_wallet_id, `Transfer ${String(t.id)}`),
          amount: num(t.amount),
          date: ms(t.date),
          note: strOrNull(t.note),
          createdAt: ms(t.created_at),
        })),
      );
    }

    // ---- budgets
    if (src.budgets.length) {
      await tx.insert(budgets).values(src.budgets.map((b) => ({ userId, month: str(b.month), amount: num(b.amount) })));
    }

    // ---- notes
    if (src.notes.length) {
      await tx.insert(notes).values(
        src.notes.map((n) => ({
          userId,
          title: str(n.title),
          content: str(n.content),
          pinned: Boolean(num(n.pinned)),
          tags: strOrNull(n.tags),
          createdAt: ms(n.created_at),
          updatedAt: ms(n.updated_at),
        })),
      );
    }

    // ---- workout schedule (the old SQLite app had morning/afternoon/evening slots: they become start times)
    const SLOT_START_MIN: Record<string, number> = { morning: 420, afternoon: 780, evening: 1080 };
    const scheduleIds = new Map<number, number>();
    for (const s of src.workoutSchedule) {
      const [row] = await tx
        .insert(workoutSchedule)
        .values({
          userId,
          dayOfWeek: num(s.day_of_week),
          startMin: SLOT_START_MIN[str(s.slot)] ?? 420,
          type: str(s.type) as WorkoutType,
          title: str(s.title),
          durationMin: num(s.duration_min),
        })
        .returning({ id: workoutSchedule.id });
      scheduleIds.set(num(s.id), row.id);
    }

    // ---- workout logs
    for (const part of chunks(src.workoutLogs)) {
      await tx.insert(workoutLogs).values(
        part.map((l) => ({
          userId,
          date: ms(l.date),
          type: str(l.type) as WorkoutType,
          title: str(l.title),
          durationMin: num(l.duration_min),
          exercises: JSON.parse(str(l.exercises || "[]")) as Exercise[],
          notes: strOrNull(l.notes),
          scheduleId: l.schedule_id === null ? null : (scheduleIds.get(num(l.schedule_id)) ?? null),
        })),
      );
    }

    // Read back what landed, inside the same transaction.
    const result: Record<string, number> = {};
    const names = ["categories", "wallets", "transactions", "transfers", "budgets", "notes", "workoutSchedule", "workoutLogs", "emails"];
    for (const [i, t] of tables.entries()) {
      const [{ n }] = await tx.select({ n: count() }).from(t).where(eq(t.userId, userId));
      result[names[i]] = n;
    }
    for (const [k, n] of Object.entries(result)) {
      const expected = src[k as keyof typeof src].length;
      if (n !== expected) throw new Error(`${k}: expected ${expected} rows, got ${n}. Nothing was imported.`);
    }
    return result;
  });

  console.log(`\n✓ Imported into ${u.email}:`);
  console.table(counts);
});
