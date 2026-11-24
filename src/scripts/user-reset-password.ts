/**
 * Forgotten password: sets a new temporary password, signs the user out
 * everywhere, and makes them choose their own password at next sign-in.
 *
 *   npm run user:reset-password -- --email budi@example.com
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { account, session, user } from "../db/schema";
import { args, db, findUser, run, temporaryPassword } from "./_cli";

run(async () => {
  const a = args({ email: { type: "string" } });
  const u = await findUser(a.email);

  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const now = new Date();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(account)
      .set({ password: hash, updatedAt: now })
      .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (!updated.length) {
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password: hash,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.update(user).set({ mustChangePassword: true, updatedAt: now }).where(eq(user.id, u.id));
    await tx.delete(session).where(eq(session.userId, u.id));
  });

  console.log(`
✓ Reset the password for ${u.name} <${u.email}> and signed them out everywhere.

  Temporary password:  ${password}

  Share it privately. They must choose their own password at next sign-in.
`);
});
