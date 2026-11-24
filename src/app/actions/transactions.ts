"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { TX_TYPES, budgets, transactions } from "@/db/schema";
import { getActivityPage, type ActivityPage } from "@/lib/queries/finance";
import { parseAmount } from "@/lib/format";
import { requireViewer } from "@/lib/viewer";
import { txInput } from "./inputs";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";
import { walletsRejectMoney } from "./wallet-guards";

// Wallet and category ownership is enforced by composite foreign keys (see schema.ts).
export async function saveTransaction(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const raw = formObject(fd);
    const { id, ...data } = txInput(v.tz).parse({ ...raw, id: raw.id || undefined });
    const rejected = await walletsRejectMoney(v.id, [data.walletId]);
    if (rejected) return { ok: false, error: rejected };
    if (id) {
      const updated = await db
        .update(transactions)
        .set(data)
        .where(and(eq(transactions.id, id), eq(transactions.userId, v.id)))
        .returning({ id: transactions.id });
      if (!updated.length) return NOT_FOUND;
    } else {
      await db.insert(transactions).values({ ...data, userId: v.id, source: "manual" });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTransaction(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(transactions)
      .where(and(eq(transactions.id, z.number().int().parse(id)), eq(transactions.userId, v.id)))
      .returning({ id: transactions.id });
    if (!deleted.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const BudgetInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Invalid month"),
  amount: z.string().transform(parseAmount).pipe(z.number().int().positive("Budget must be more than 0")),
});

export async function saveBudget(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const { month, amount } = BudgetInput.parse(formObject(fd));
    await db
      .insert(budgets)
      .values({ userId: v.id, month, amount })
      .onConflictDoUpdate({ target: [budgets.userId, budgets.month], set: { amount } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** The next 10 income or expense rows after the last one shown (the overview's Recent Activity). */
export async function loadActivity(
  type: string,
  beforeISO: string,
  beforeId: number,
): Promise<({ ok: true } & ActivityPage) | { ok: false; error: string }> {
  const v = await requireViewer();
  try {
    const input = z
      .object({ type: z.enum(TX_TYPES), beforeISO: z.iso.datetime(), beforeId: z.number().int().positive() })
      .parse({ type, beforeISO, beforeId });
    const page = await getActivityPage(v, input.type, { date: new Date(input.beforeISO), id: input.beforeId });
    return { ok: true, ...page };
  } catch (err) {
    const res = fail(err);
    return res.ok ? { ok: false, error: "Couldn't load more." } : res;
  }
}
