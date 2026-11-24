"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { CATEGORY_ICONS, TX_TYPES } from "@/lib/constants";
import { requireViewer } from "@/lib/viewer";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";

const CategoryInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Name is required").max(40),
  type: z.enum(TX_TYPES),
  icon: z.enum(CATEGORY_ICONS).catch("circle"),
});

export async function saveCategory(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const raw = formObject(fd);
    const { id, ...data } = CategoryInput.parse({ ...raw, id: raw.id || undefined });
    const [clash] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, v.id),
          eq(categories.type, data.type),
          sql`lower(${categories.name}) = lower(${data.name})`,
        ),
      )
      .limit(1);
    if (clash && clash.id !== id) return { ok: false, error: `You already have a category called "${data.name}".` };

    let savedId = id;
    if (id) {
      const [current] = await db
        .select({ type: categories.type })
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.userId, v.id)))
        .limit(1);
      if (!current) return NOT_FOUND;
      // Moving a used category between income and expense would mislabel its transactions.
      if (current.type !== data.type) {
        const [used] = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.userId, v.id), eq(transactions.categoryId, id)))
          .limit(1);
        if (used) return { ok: false, error: "This category has transactions, so its type can't change." };
      }
      await db
        .update(categories)
        .set(data)
        .where(and(eq(categories.id, id), eq(categories.userId, v.id)));
    } else {
      const [row] = await db
        .insert(categories)
        .values({ ...data, userId: v.id })
        .returning({ id: categories.id });
      savedId = row.id;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: savedId };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deletes a category. Its transactions move to `moveToId` (same type), or become
 * "Uncategorized" when `moveToId` is null — nothing is deleted with it.
 */
export async function deleteCategory(id: number, moveToId: number | null): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const categoryId = z.number().int().positive().parse(id);
    const target = moveToId === null ? null : z.number().int().positive().parse(moveToId);
    if (target === categoryId) return { ok: false, error: "Pick a different category." };

    const mine = await db
      .select({ id: categories.id, type: categories.type })
      .from(categories)
      .where(eq(categories.userId, v.id));
    const cat = mine.find((c) => c.id === categoryId);
    if (!cat) return NOT_FOUND;
    if (target !== null) {
      const t = mine.find((c) => c.id === target);
      if (!t) return NOT_FOUND;
      if (t.type !== cat.type) return { ok: false, error: "Move transactions to a category of the same type." };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({ categoryId: target })
        .where(and(eq(transactions.userId, v.id), eq(transactions.categoryId, categoryId)));
      await tx.delete(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, v.id)));
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
