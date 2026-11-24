/**
 * Invite someone: creates an account with a one-time temporary password.
 * They must choose their own password at first sign-in.
 *
 *   npm run user:create -- --email budi@example.com --name "Budi Santoso" [--tz Asia/Makassar]
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { account, user } from "../db/schema";
import { DEFAULT_TIMEZONE } from "../lib/constants";
import { isTimeZone } from "../lib/timezones";
import { args, db, die, run, temporaryPassword } from "./_cli";

run(async () => {
  const a = args({ email: { type: "string" }, name: { type: "string" }, tz: { type: "string" } });
  const email = z.email().safeParse(a.email?.trim().toLowerCase());
  if (!email.success) die("Pass a valid --email you@example.com");
  const name = a.name?.trim();
  if (!name) die('Pass --name "Their Name"');
  const tz = a.tz ?? DEFAULT_TIMEZONE;
  if (!isTimeZone(tz)) die(`Unknown timezone "${tz}". Use an IANA name such as Asia/Jakarta.`);

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.data)).limit(1);
  if (existing) die(`${email.data} already has an account. Use npm run user:reset-password -- --email ${email.data}`);

  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const id = randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id,
      name,
      email: email.data,
      emailVerified: true,
      timezone: tz,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });
    // Better Auth's email/password login looks for a "credential" account with accountId = user id.
    await tx.insert(account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
      createdAt: now,
      updatedAt: now,
    });
  });

  console.log(`
✓ Created ${name} <${email.data}> (timezone ${tz})

  Temporary password:  ${password}

  Share it privately (not in a group chat). It works once: at first sign-in
  they must choose their own password. It is not stored anywhere in plain text.
`);
});
