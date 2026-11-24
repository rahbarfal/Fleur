/**
 * Fills ONE user's account with realistic sample data (the same data a
 * "Try the demo" sandbox gets, see src/lib/demo/sample-data.ts).
 * Wipes that user's existing data first; other users are untouched.
 *
 *   npm run db:seed -- --email demo@example.com [--yes]
 */
import { eq } from "drizzle-orm";
import {
  budgets,
  categories,
  debts,
  emailRules,
  emails,
  emailWalletLinks,
  noteImages,
  notes,
  stockHoldings,
  transactions,
  transfers,
  wallets,
  workoutLogs,
  workoutSchedule,
} from "../db/schema";
import { seedSampleData } from "../lib/demo/sample-data";
import { args, confirm, db, findUser, run } from "./_cli";

run(async () => {
  const a = args({ email: { type: "string" }, yes: { type: "boolean" } });
  const u = await findUser(a.email);
  if (!(await confirm(`Replace ALL data of ${u.name} <${u.email}> with sample data?`, a.yes))) return console.log("Cancelled.");

  const summary = await db.transaction(async (tx) => {
    // Children before parents (transactions/transfers point at wallets, categories and emails).
    for (const t of [transactions, transfers, emailWalletLinks, emailRules, emails, wallets, categories, budgets, stockHoldings, debts, notes, noteImages, workoutLogs, workoutSchedule]) {
      await tx.delete(t).where(eq(t.userId, u.id));
    }
    return seedSampleData(tx, { userId: u.id, tz: u.timezone });
  });
  console.log(
    "Seeded " +
      Object.entries(summary)
        .map(([k, n]) => `${n} ${k}`)
        .join(", ") +
      ".",
  );
});
