/**
 * "Try the demo" sandboxes: each click on the login page creates a private,
 * throwaway account (user.is_demo) filled with sample data. It lives for
 * DEMO_TTL_MS; then getViewer() treats it as signed out and the cleanup
 * (Supabase pg_cron every 10 minutes, a daily Vercel cron, and every new demo)
 * deletes the user row, which cascades to all of its data.
 */
import { and, count, eq, gt, lt } from "drizzle-orm";
import type { db as Db } from "@/db";
import { user } from "@/db/schema";

export const DEMO_TTL_MS = 60 * 60 * 1000;
/** Live sandboxes at once; bounds the database size if someone hammers the button. */
export const DEMO_MAX_LIVE = 60;
/** Images a sandbox may upload to notes (they're stored in Postgres). */
export const DEMO_MAX_NOTE_IMAGES = 3;
export const DEMO_EMAIL_DOMAIN = "demo.fleur.invalid";

/** SQL the cron jobs run. Deleting the user cascades to every user-owned table. */
export const DEMO_CLEANUP_SQL = `delete from public."user" where is_demo and demo_expires_at < now()`;

export function demoEnabled(): boolean {
  return process.env.DEMO_ENABLED !== "false";
}

/** Deletes ended sandboxes (and, through the cascade, all their data). Returns how many. */
export async function deleteExpiredDemos(db: typeof Db): Promise<number> {
  const gone = await db
    .delete(user)
    .where(and(eq(user.isDemo, true), lt(user.demoExpiresAt, new Date())))
    .returning({ id: user.id });
  return gone.length;
}

export async function liveDemoCount(db: typeof Db): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(user)
    .where(and(eq(user.isDemo, true), gt(user.demoExpiresAt, new Date())));
  return r?.n ?? 0;
}
