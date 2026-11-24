"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { debts } from "@/db/schema";
import { DEBT_CYCLES, DEBT_KINDS } from "@/lib/constants";
import { parseAmount } from "@/lib/format";
import { requireViewer } from "@/lib/viewer";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";

/** Keeps amounts well inside what a JS number holds exactly. */
const MAX_AMOUNT = 1_000_000_000_000;
/** Longest each month can be (February allows 29; short years use the 28th). */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Empty = 0 (nothing owed). */
const amount = z
  .string()
  .optional()
  .transform((v) => (v ? parseAmount(v) : 0))
  .pipe(z.number().int().min(0).max(MAX_AMOUNT, "That amount is too large"));

/** Empty or 0 = not set. */
const optionalAmount = z
  .string()
  .optional()
  .transform((v) => (v ? parseAmount(v) : 0) || null)
  .pipe(z.number().int().positive().max(MAX_AMOUNT, "That amount is too large").nullable());

/** Empty = not set. */
const optionalInt = (min: number, max: number, message: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number(message).int(message).min(min, message).max(max, message).nullable());

const DebtInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Name is required").max(40),
  kind: z.enum(DEBT_KINDS, "Pick a type"),
  amount,
  creditLimit: optionalAmount,
  installment: optionalAmount,
  cycle: z.enum(DEBT_CYCLES).optional().default("monthly"),
  dueDay: optionalInt(1, 31, "Pick a day between 1 and 31"),
  dueMonth: optionalInt(1, 12, "Pick a month"),
  note: z.string().trim().max(200).optional().transform((v) => v || null),
});

/** Adds or edits a credit card, online credit, subscription… It never touches wallets or net worth. */
export async function saveDebt(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const raw = formObject(fd);
    const input = DebtInput.parse({ ...raw, id: raw.id || undefined });
    const { id, name, kind } = input;
    const sub = kind === "subscription";
    // Only subscriptions renew yearly; only debts have a limit or installments.
    const cycle = sub ? input.cycle : "monthly";
    const dueDay = input.dueDay;
    const dueMonth = cycle === "yearly" ? input.dueMonth : null;
    if (sub && input.amount === 0) return { ok: false, error: "Enter the subscription's price." };
    if (cycle === "yearly" && dueDay !== null && dueMonth === null) return { ok: false, error: "Pick the month it renews." };
    if (cycle === "yearly" && dueDay === null && dueMonth !== null) return { ok: false, error: "Pick the day it renews." };
    if (dueMonth !== null && dueDay !== null && dueDay > MONTH_DAYS[dueMonth - 1]) {
      return { ok: false, error: "That day doesn't exist in that month." };
    }
    const values = {
      name,
      kind,
      amount: input.amount,
      creditLimit: sub ? null : input.creditLimit,
      installment: sub || kind === "credit_card" ? null : input.installment,
      cycle,
      dueDay,
      dueMonth,
      note: input.note,
    };

    const [clash] = await db
      .select({ id: debts.id })
      .from(debts)
      .where(and(eq(debts.userId, v.id), sql`lower(${debts.name}) = lower(${name})`))
      .limit(1);
    if (clash && clash.id !== id) return { ok: false, error: `You already have a debt called "${name}".` };

    if (id) {
      const updated = await db
        .update(debts)
        .set(values)
        .where(and(eq(debts.id, id), eq(debts.userId, v.id)))
        .returning({ id: debts.id });
      if (!updated.length) return NOT_FOUND;
      revalidatePath("/", "layout");
      return { ok: true, id };
    }
    const [last] = await db
      .select({ max: sql<number>`coalesce(max(${debts.sortOrder}), -1)`.mapWith(Number) })
      .from(debts)
      .where(eq(debts.userId, v.id));
    const [row] = await db
      .insert(debts)
      .values({ ...values, userId: v.id, sortOrder: (last?.max ?? -1) + 1 })
      .returning({ id: debts.id });
    revalidatePath("/", "layout");
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteDebt(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(debts)
      .where(and(eq(debts.id, z.number().int().positive().parse(id)), eq(debts.userId, v.id)))
      .returning({ id: debts.id });
    if (!deleted.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
