"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { transactions, transfers, wallets } from "@/db/schema";
import { sumWhere } from "@/db/sql";
import { ADJUSTMENT_TITLE, WALLET_TYPES } from "@/lib/constants";
import { parseAmount } from "@/lib/format";
import { requireViewer } from "@/lib/viewer";
import { transferInput } from "./inputs";
import { NOT_FOUND, fail, formObject, localDateTime, type ActionResult } from "./result";
import { walletsRejectMoney } from "./wallet-guards";

/** "Rp 1.500.000" or "-250.000" (e.g. a credit card in debt) → signed whole rupiah. */
const signedAmount = z
  .string()
  .transform((v) => (v.trim().startsWith("-") ? -1 : 1) * parseAmount(v));

const WalletInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Name is required").max(40),
  type: z.enum(WALLET_TYPES),
  /** New wallets: what it held before tracking started. */
  openingBalance: signedAmount.optional(),
  /** Edits: the balance it should have now (the difference is recorded as an adjustment). */
  balance: signedAmount.optional(),
});

/** Current balance of one wallet: opening + income − expense + transfers in − transfers out. */
async function walletBalance(tx: Tx, userId: string, walletId: number): Promise<number | null> {
  const [w] = await tx
    .select({ opening: wallets.openingBalance })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);
  if (!w) return null;
  const [[t], [tr]] = await Promise.all([
    tx
      .select({
        net: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end), 0)`.mapWith(Number),
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.walletId, walletId))),
    tx
      .select({
        inn: sumWhere(transfers.amount, eq(transfers.toWalletId, walletId)),
        out: sumWhere(transfers.amount, eq(transfers.fromWalletId, walletId)),
      })
      .from(transfers)
      .where(and(eq(transfers.userId, userId), or(eq(transfers.fromWalletId, walletId), eq(transfers.toWalletId, walletId)))),
  ]);
  return w.opening + (t?.net ?? 0) + (tr?.inn ?? 0) - (tr?.out ?? 0);
}

export async function saveWallet(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const raw = formObject(fd);
    const { id, name, type, openingBalance, balance } = WalletInput.parse({
      ...raw,
      id: raw.id || undefined,
    });
    const [clash] = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, v.id), isNull(wallets.deletedAt), sql`lower(${wallets.name}) = lower(${name})`))
      .limit(1);
    if (clash && clash.id !== id) return { ok: false, error: `You already have a wallet called "${name}".` };

    let savedId = id;
    if (id) {
      const result = await db.transaction(async (tx): Promise<ActionResult | null> => {
        const [current] = await tx
          .select({ id: wallets.id })
          .from(wallets)
          .where(and(eq(wallets.id, id), eq(wallets.userId, v.id), isNull(wallets.deletedAt)))
          .limit(1);
        if (!current) return NOT_FOUND;

        await tx.update(wallets).set({ name, type }).where(and(eq(wallets.id, id), eq(wallets.userId, v.id)));
        if (balance !== undefined) {
          // The balance is computed here, never taken from the browser.
          const now = (await walletBalance(tx, v.id, id)) ?? 0;
          const diff = balance - now;
          if (diff !== 0) {
            await tx.insert(transactions).values({
              userId: v.id,
              walletId: id,
              type: diff > 0 ? "income" : "expense",
              amount: Math.abs(diff),
              categoryId: null,
              title: ADJUSTMENT_TITLE,
              date: new Date(),
              source: "manual",
            });
          }
        }
        return null;
      });
      if (result) return result;
    } else {
      const [last] = await db
        .select({ max: sql<number>`coalesce(max(${wallets.sortOrder}), -1)`.mapWith(Number) })
        .from(wallets)
        .where(eq(wallets.userId, v.id));
      const [row] = await db
        .insert(wallets)
        .values({
          name,
          type,
          userId: v.id,
          sortOrder: (last?.max ?? -1) + 1,
          openingBalance: openingBalance ?? 0,
        })
        .returning({ id: wallets.id });
      savedId = row.id;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: savedId };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deletes a wallet and its own transactions, so its balance disappears from net
 * worth. Transfers with other wallets are kept (their balances don't change):
 * a wallet that has transfers is archived instead of removed, so the history
 * still shows its name. The last wallet can be deleted too.
 */
export async function deleteWallet(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const walletId = z.number().int().positive().parse(id);
    const deleted = await db.transaction(async (tx) => {
      const own = and(eq(wallets.id, walletId), eq(wallets.userId, v.id));
      const [mine] = await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(and(own, isNull(wallets.deletedAt)))
        .limit(1);
      if (!mine) return false;
      await tx
        .delete(transactions)
        .where(and(eq(transactions.userId, v.id), eq(transactions.walletId, walletId)));
      const [hasTransfers] = await tx
        .select({ id: transfers.id })
        .from(transfers)
        .where(and(eq(transfers.userId, v.id), or(eq(transfers.fromWalletId, walletId), eq(transfers.toWalletId, walletId))))
        .limit(1);
      if (hasTransfers) await tx.update(wallets).set({ deletedAt: new Date() }).where(own);
      else await tx.delete(wallets).where(own);
      return true;
    });
    if (!deleted) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// Both wallets must be the viewer's (also enforced by composite foreign keys) and active.
export async function saveTransfer(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const data = transferInput(v.tz).parse(formObject(fd));
    const rejected = await walletsRejectMoney(v.id, [data.fromWalletId, data.toWalletId]);
    if (rejected) return { ok: false, error: rejected };
    await db.insert(transfers).values({ ...data, userId: v.id });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTransfer(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(transfers)
      .where(and(eq(transfers.id, z.number().int().parse(id)), eq(transfers.userId, v.id)))
      .returning({ id: transfers.id });
    if (!deleted.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
