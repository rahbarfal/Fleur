"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { emailRules, emailWalletLinks, emails, gmailAccounts, stockHoldings, transactions, transfers, type Email } from "@/db/schema";
import { EMAIL_CATEGORIES, FINANCE_SOURCES, STOCK_SYMBOLS, type FinanceSource, type StockSymbol } from "@/lib/constants";
import { jobStageOf } from "@/lib/email/classify";
import { domainOf } from "@/lib/email/finance/common";
import { refileWaiting } from "@/lib/email/finance/record";
import { decrypt } from "@/lib/gmail/crypto";
import { revokeToken } from "@/lib/gmail/oauth";
import { reclassifyAll, syncGmail, type SyncResult } from "@/lib/gmail/sync";
import { requireViewer } from "@/lib/viewer";
import { transferInput, txInput } from "./inputs";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";
import { walletsRejectMoney } from "./wallet-guards";

const HANDLED: ActionResult = { ok: false, error: "That email was already handled. Refresh the page." };
const emailIdInput = z.coerce.number().int().positive();

/* ------------------------------------------------------------------ sync & link */

/** Fetches new mail now (also called by the page every 5 minutes while it's open). */
export async function syncNow(): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  const v = await requireViewer();
  if (v.isDemo) return { ok: false, error: "Email isn't part of the demo" };
  try {
    const result = await syncGmail(v.id);
    if (result.added || result.status === "reauth") revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (err) {
    const f = fail(err);
    return f.ok ? { ok: false, error: "Sync failed" } : f;
  }
}

/** Removes the link (and revokes Fleur's access at Google). Synced emails are deleted only if asked. */
export async function unlinkGmail(deleteEmails: boolean): Promise<ActionResult> {
  const v = await requireViewer({ allowPendingPassword: true });
  try {
    const wipe = z.boolean().parse(deleteEmails);
    const [acc] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, v.id));
    if (!acc) return NOT_FOUND;
    try {
      await revokeToken(decrypt(acc.refreshToken));
    } catch {
      /* unreadable token: nothing to revoke */
    }
    await db.transaction(async (tx) => {
      await tx.delete(gmailAccounts).where(eq(gmailAccounts.userId, v.id));
      if (wipe) await wipeEmails(tx, v.id);
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Transactions recorded from the emails stay in Money; only their link to the email goes. */
async function wipeEmails(tx: Tx, userId: string) {
  await tx
    .update(transactions)
    .set({ emailId: null })
    .where(and(eq(transactions.userId, userId), isNotNull(transactions.emailId)));
  await tx
    .update(transfers)
    .set({ emailId: null })
    .where(and(eq(transfers.userId, userId), isNotNull(transfers.emailId)));
  await tx.delete(emails).where(eq(emails.userId, userId));
}

/** Deletes emails kept after an earlier unlink (only while no Gmail is linked). */
export async function deleteKeptEmails(): Promise<ActionResult> {
  const v = await requireViewer({ allowPendingPassword: true });
  try {
    const [acc] = await db.select({ userId: gmailAccounts.userId }).from(gmailAccounts).where(eq(gmailAccounts.userId, v.id));
    if (acc) return { ok: false, error: "Unlink Gmail first." };
    await db.transaction((tx) => wipeEmails(tx, v.id));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ categories & rules */

const MoveInput = z.object({
  id: emailIdInput,
  category: z.enum(EMAIL_CATEGORIES),
  scope: z.enum(["once", "sender", "domain"]),
});

/** "Move to…": this email only, or a rule for its sender / domain (applied to past emails too). */
export async function moveEmail(input: z.input<typeof MoveInput>): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const { id, category, scope } = MoveInput.parse(input);
    const [e] = await db.select().from(emails).where(and(eq(emails.id, id), eq(emails.userId, v.id)));
    if (!e) return NOT_FOUND;
    const jobStage = category === "jobseek" ? jobStageOf(`${e.subject} ${e.snippet}`) : null;

    if (scope === "once") {
      await db.update(emails).set({ category, categorySource: "manual", jobStage }).where(eq(emails.id, e.id));
    } else {
      const pattern = scope === "sender" ? e.fromAddress.toLowerCase() : domainOf(e.fromAddress);
      if (!pattern) return { ok: false, error: "This email has no sender address." };
      await db
        .insert(emailRules)
        .values({ userId: v.id, kind: scope === "sender" ? "address" : "domain", pattern, category })
        .onConflictDoUpdate({ target: [emailRules.userId, emailRules.kind, emailRules.pattern], set: { category } });
      // The email you picked follows the rule even if you had moved it by hand before.
      await db.update(emails).set({ category, categorySource: "rule", jobStage }).where(eq(emails.id, e.id));
      await reclassifyAll(v.id);
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRule(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(emailRules)
      .where(and(eq(emailRules.id, z.number().int().parse(id)), eq(emailRules.userId, v.id)))
      .returning({ id: emailRules.id });
    if (!deleted.length) return NOT_FOUND;
    await reclassifyAll(v.id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Forget which wallet a bank's emails go into (they'll wait for review again). */
export async function forgetWalletLink(source: FinanceSource): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    await db
      .delete(emailWalletLinks)
      .where(and(eq(emailWalletLinks.userId, v.id), eq(emailWalletLinks.source, z.enum(FINANCE_SOURCES).parse(source))));
    revalidatePath("/email");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ review */

/** The waiting email (and its paired top-up/debit), locked for this transaction. */
async function waiting(tx: Tx, userId: string, id: number): Promise<{ e: Email; pair: Email | null } | null> {
  const [e] = await tx
    .select()
    .from(emails)
    .where(and(eq(emails.id, id), eq(emails.userId, userId), eq(emails.financeStatus, "review")))
    .for("update");
  if (!e?.parsed) return null;
  const pairId = e.parsed.pairEmailId;
  const [pair] = pairId
    ? await tx
        .select()
        .from(emails)
        .where(and(eq(emails.id, pairId), eq(emails.userId, userId), eq(emails.financeStatus, "review")))
    : [];
  return { e, pair: pair ?? null };
}

async function remember(tx: Tx, userId: string, source: FinanceSource, walletId: number) {
  await tx
    .insert(emailWalletLinks)
    .values({ userId, source, walletId })
    .onConflictDoUpdate({ target: [emailWalletLinks.userId, emailWalletLinks.source], set: { walletId } });
}

/**
 * Records a reviewed email as an expense/income or a transfer (the form is the normal
 * Money form, pre-filled). "Use this wallet for all … emails" saves the wallet link.
 */
export async function recordEmail(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const raw = formObject(fd);
    const id = emailIdInput.parse(raw.emailId);
    const keep = raw.remember === "on";
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const w = await waiting(tx, v.id, id);
      if (!w) return HANDLED;
      const ids = [w.e.id, ...(w.pair ? [w.pair.id] : [])];
      const remembered = new Set<FinanceSource>();

      if (raw.type === "transfer") {
        const data = transferInput(v.tz).parse(raw);
        const rejected = await walletsRejectMoney(v.id, [data.fromWalletId, data.toWalletId], tx);
        if (rejected) return { ok: false, error: rejected };
        await tx.insert(transfers).values({ ...data, userId: v.id, emailId: w.e.id });
        if (keep) {
          for (const m of [w.e, w.pair]) {
            if (!m?.financeSource || !m.parsed) continue;
            // The debit side is where money left; the top-up side is where it arrived.
            await remember(tx, v.id, m.financeSource, m.parsed.kind === "topup" ? data.toWalletId : data.fromWalletId);
            remembered.add(m.financeSource);
          }
        }
      } else {
        const { id: _id, ...data } = txInput(v.tz).parse({ ...raw, id: undefined });
        const rejected = await walletsRejectMoney(v.id, [data.walletId], tx);
        if (rejected) return { ok: false, error: rejected };
        await tx.insert(transactions).values({ ...data, userId: v.id, source: "email", emailId: w.e.id });
        if (keep && w.e.financeSource) {
          await remember(tx, v.id, w.e.financeSource, data.walletId);
          remembered.add(w.e.financeSource);
        }
      }

      await tx
        .update(emails)
        .set({ financeStatus: "recorded" })
        .where(and(eq(emails.userId, v.id), inArray(emails.id, ids)));
      // Other emails from that bank that only waited for a wallet can be recorded now.
      for (const s of remembered) await refileWaiting(tx, v.id, s);
      return { ok: true };
    });
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    return fail(err);
  }
}

/** A buy/sell confirmation: adds or removes those lots on your stock (a first buy adds the stock). */
export async function applyTrade(emailId: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const id = emailIdInput.parse(emailId);
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const w = await waiting(tx, v.id, id);
      const stock = w?.e.parsed?.stock;
      if (!w || !stock) return HANDLED;
      if (!(STOCK_SYMBOLS as readonly string[]).includes(stock.symbol)) {
        return { ok: false, error: `Fleur tracks ${STOCK_SYMBOLS.join(" and ")} only. Ignore this one.` };
      }
      const symbol = stock.symbol as StockSymbol;
      const [holding] = await tx
        .select()
        .from(stockHoldings)
        .where(and(eq(stockHoldings.userId, v.id), eq(stockHoldings.symbol, symbol)))
        .for("update");
      const lots = (holding?.lots ?? 0) + (stock.side === "buy" ? stock.lots : -stock.lots);
      if (lots < 0) return { ok: false, error: `You only hold ${holding?.lots ?? 0} lot ${symbol}.` };
      if (holding) {
        await tx.update(stockHoldings).set({ lots }).where(eq(stockHoldings.id, holding.id));
      } else {
        const [last] = await tx
          .select({ max: sql<number>`coalesce(max(${stockHoldings.sortOrder}), -1)`.mapWith(Number) })
          .from(stockHoldings)
          .where(eq(stockHoldings.userId, v.id));
        await tx.insert(stockHoldings).values({ userId: v.id, symbol, lots, sortOrder: (last?.max ?? -1) + 1 });
      }
      await tx.update(emails).set({ financeStatus: "recorded" }).where(eq(emails.id, w.e.id));
      return { ok: true };
    });
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    return fail(err);
  }
}

/** "Not a transaction": stops asking about this email (and its pair). */
export async function ignoreReview(emailId: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const id = emailIdInput.parse(emailId);
    const ok = await db.transaction(async (tx) => {
      const w = await waiting(tx, v.id, id);
      if (!w) return false;
      const ids = [w.e.id, ...(w.pair ? [w.pair.id] : [])];
      await tx.update(emails).set({ financeStatus: "ignored" }).where(and(eq(emails.userId, v.id), inArray(emails.id, ids)));
      return true;
    });
    if (!ok) return HANDLED;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Undo: removes what an email recorded (transaction, transfer or lots change); it won't be recorded again. */
export async function undoRecorded(emailId: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const id = emailIdInput.parse(emailId);
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const [e] = await tx
        .select()
        .from(emails)
        .where(and(eq(emails.id, id), eq(emails.userId, v.id), eq(emails.financeStatus, "recorded")))
        .for("update");
      if (!e?.parsed) return HANDLED;
      const ids = [e.id, ...(e.parsed.pairEmailId ? [e.parsed.pairEmailId] : [])];

      const stock = e.parsed.stock;
      if (e.parsed.kind === "trade" && stock) {
        const [holding] = await tx
          .select()
          .from(stockHoldings)
          .where(and(eq(stockHoldings.userId, v.id), eq(stockHoldings.symbol, stock.symbol as StockSymbol)))
          .for("update");
        if (holding) {
          const lots = Math.max(0, holding.lots - (stock.side === "buy" ? stock.lots : -stock.lots));
          await tx.update(stockHoldings).set({ lots }).where(eq(stockHoldings.id, holding.id));
        }
      }
      await tx.delete(transactions).where(and(eq(transactions.userId, v.id), inArray(transactions.emailId, ids)));
      await tx.delete(transfers).where(and(eq(transfers.userId, v.id), inArray(transfers.emailId, ids)));
      await tx.update(emails).set({ financeStatus: "ignored" }).where(and(eq(emails.userId, v.id), inArray(emails.id, ids)));
      return { ok: true };
    });
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    return fail(err);
  }
}
