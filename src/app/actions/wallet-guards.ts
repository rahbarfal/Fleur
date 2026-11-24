import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { wallets } from "@/db/schema";

/**
 * Whether money can be recorded in these wallets: each must be the viewer's
 * and not deleted.
 * Returns an error message, or null when they're all fine.
 */
export async function walletsRejectMoney(userId: string, ids: number[], tx: Tx | typeof db = db): Promise<string | null> {
  const unique = [...new Set(ids)];
  const rows = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt), inArray(wallets.id, unique)));
  if (rows.length !== unique.length) return "That wallet doesn't exist anymore. Refresh the page.";
  return null;
}
