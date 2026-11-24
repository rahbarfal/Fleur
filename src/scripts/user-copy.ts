/**
 * Copies ONE account and all of its data from the local database (DATABASE_URL)
 * to Supabase (SUPABASE_DB_URL in .env.supabase), keeping ids, in one transaction.
 * The password hash moves too, so the same password works in production.
 * Sessions are not copied (production signs cookies with a different secret).
 *
 *   npm run db:migrate:supabase                                   # tables first
 *   npm run user:copy -- --email you@example.com [--yes]
 */
import { eq, getTableName, sql, type InferSelectModel } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  account,
  budgets,
  categories,
  debts,
  emailRules,
  emails,
  emailWalletLinks,
  gmailAccounts,
  noteImages,
  notes,
  stockHoldings,
  stockPrices,
  stockWatchlist,
  transactions,
  transfers,
  user,
  wallets,
  workoutLogs,
  workoutSchedule,
} from "../db/schema";
import { args, confirm, db, die, findUser, run, supabaseDb } from "./_cli";

/** Parents before children: transactions/transfers point at wallets, categories and emails. */
const USER_TABLES = [
  categories,
  wallets,
  emails,
  stockHoldings,
  stockWatchlist,
  debts,
  transfers,
  transactions,
  budgets,
  notes,
  noteImages,
  workoutSchedule,
  workoutLogs,
  emailRules,
  emailWalletLinks,
  gmailAccounts,
] as const;

/** Tables with an identity `id`: their sequences must continue after the copied ids. */
const IDENTITY_TABLES = [categories, wallets, emails, stockHoldings, stockWatchlist, debts, transfers, transactions, budgets, notes, workoutSchedule, workoutLogs, emailRules];

run(async () => {
  const a = args({ email: { type: "string" }, yes: { type: "boolean" } });
  const u = await findUser(a.email);
  if (u.isDemo) die("That's a demo sandbox, not a real account.");

  const target = supabaseDb();
  try {
    const [exists] = await target.select({ id: user.id }).from(user).where(eq(user.email, u.email));
    if (exists) die(`${u.email} already exists on Supabase. Nothing was copied.`);

    // Read everything first, so the target transaction stays short.
    const accounts = await db.select().from(account).where(eq(account.userId, u.id));
    const data: { table: PgTable; name: string; rows: InferSelectModel<PgTable>[] }[] = [];
    for (const t of USER_TABLES) {
      const rows = await db.select().from(t as PgTable).where(eq(t.userId, u.id));
      data.push({ table: t, name: getTableName(t), rows });
    }
    const prices = await db.select().from(stockPrices);

    console.log(`\nCopy ${u.name} <${u.email}> to Supabase:`);
    console.table(Object.fromEntries([["account (login)", accounts.length], ...data.map((d) => [d.name, d.rows.length])]));
    if (!(await confirm("Go ahead?", a.yes))) return console.log("Cancelled.");

    await target.transaction(async (tx) => {
      await tx.insert(user).values(u);
      if (accounts.length) await tx.insert(account).values(accounts);
      for (const d of data) {
        for (let i = 0; i < d.rows.length; i += 500) await tx.insert(d.table).values(d.rows.slice(i, i + 500));
      }
      if (prices.length) await tx.insert(stockPrices).values(prices).onConflictDoNothing();
      for (const t of IDENTITY_TABLES) {
        const name = getTableName(t);
        await tx.execute(
          sql.raw(`select setval(pg_get_serial_sequence('public.${name}', 'id'), greatest((select coalesce(max(id), 0) from public.${name}), 1))`),
        );
      }
    });
    console.log(`\n✓ Copied. Sign in on production with the same email and password.\n`);
  } finally {
    await target.$client.end({ timeout: 5 });
  }
});
