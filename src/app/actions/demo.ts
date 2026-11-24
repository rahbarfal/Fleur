"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { DEMO_EMAIL_DOMAIN, DEMO_MAX_LIVE, DEMO_TTL_MS, deleteExpiredDemos, demoEnabled, liveDemoCount } from "@/lib/demo/demo";
import { seedSampleData } from "@/lib/demo/sample-data";
import { getViewer } from "@/lib/viewer";

/**
 * "Try the demo": creates a private sandbox account with sample data, signs the
 * visitor into it and opens the Overview. The sandbox is deleted after an hour.
 * The account's password is random and never shown, so nobody can sign into it
 * again once the session ends.
 */
export async function startDemo(): Promise<{ ok: false; error: string }> {
  if (!demoEnabled()) return { ok: false, error: "The demo is turned off." };

  try {
    await deleteExpiredDemos(db);
    if ((await liveDemoCount(db)) >= DEMO_MAX_LIVE) {
      return { ok: false, error: "The demo is busy right now. Try again in a few minutes." };
    }

    const id = randomUUID();
    const email = `demo-${id.slice(0, 8)}@${DEMO_EMAIL_DOMAIN}`;
    const password = randomBytes(24).toString("base64url");
    const hash = await hashPassword(password);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id,
        name: "Demo Visitor",
        email,
        emailVerified: true,
        timezone: DEFAULT_TIMEZONE,
        isDemo: true,
        demoExpiresAt: new Date(now.getTime() + DEMO_TTL_MS),
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hash,
        createdAt: now,
        updatedAt: now,
      });
      await seedSampleData(tx, { userId: id, tz: DEFAULT_TIMEZONE, now });
    });

    // Server-side call: sets the session cookie (nextCookies plugin) and skips the HTTP rate limiter.
    await auth.api.signInEmail({ body: { email, password, rememberMe: false }, headers: await headers() });
  } catch (err) {
    console.error("startDemo failed", err);
    return { ok: false, error: "Couldn't start the demo. Please try again." };
  }
  redirect("/");
}

/** "Exit demo": signs out and deletes the sandbox and its data right away. */
export async function endDemo(): Promise<void> {
  const v = await getViewer();
  if (v?.isDemo) {
    try {
      await auth.api.signOut({ headers: await headers() });
    } catch {
      // The session row goes with the user below anyway.
    }
    await db.delete(user).where(and(eq(user.id, v.id), eq(user.isDemo, true)));
  }
  redirect("/login");
}
