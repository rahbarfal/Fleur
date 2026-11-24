/**
 * Removes an account and ALL of its data (wallets, transactions, notes, workouts, emails).
 *
 *   npm run user:delete -- --email budi@example.com [--yes]
 */
import { eq } from "drizzle-orm";
import { user } from "../db/schema";
import { args, confirm, db, findUser, run } from "./_cli";

run(async () => {
  const a = args({ email: { type: "string" }, yes: { type: "boolean" } });
  const u = await findUser(a.email);
  const ok = await confirm(
    `Delete ${u.name} <${u.email}> and all of their data? This cannot be undone.`,
    a.yes,
  );
  if (!ok) return console.log("Cancelled.");
  // Every table references user.id with ON DELETE CASCADE.
  await db.delete(user).where(eq(user.id, u.id));
  console.log(`✓ Deleted ${u.email}.`);
});
