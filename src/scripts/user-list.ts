/**
 * Lists accounts with a few counts.
 *
 *   npm run user:list
 */
import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { session, transactions, user, wallets } from "../db/schema";
import { db, run } from "./_cli";

run(async () => {
  const all = await db.select().from(user).orderBy(asc(user.createdAt));
  // "Try the demo" sandboxes are throwaway accounts; only count them.
  const users = all.filter((u) => !u.isDemo);
  const demos = all.length - users.length;
  if (!users.length) return console.log(`No accounts yet${demos ? ` (${demos} demo sandboxes)` : ""}. Create one with npm run user:create.`);

  const now = new Date();
  const rows = await Promise.all(
    users.map(async (u) => {
      const [[s], [w], [t]] = await Promise.all([
        db.select({ n: count() }).from(session).where(and(eq(session.userId, u.id), gt(session.expiresAt, now))),
        db.select({ n: count() }).from(wallets).where(and(eq(wallets.userId, u.id), isNull(wallets.deletedAt))),
        db.select({ n: count() }).from(transactions).where(eq(transactions.userId, u.id)),
      ]);
      return {
        email: u.email,
        name: u.name,
        timezone: u.timezone,
        "temp password": u.mustChangePassword ? "yes" : "",
        sessions: s.n,
        wallets: w.n,
        transactions: t.n,
        created: u.createdAt.toISOString().slice(0, 10),
      };
    }),
  );
  console.table(rows);
  if (demos) console.log(`+ ${demos} demo sandbox${demos === 1 ? "" : "es"} (deleted an hour after they start).`);
});
