/**
 * Re-reads stored bank / e-wallet / Ajaib emails with the current parsers, e.g. after a
 * parser fix. Only emails that weren't recorded or dismissed are touched.
 *
 *   npm run email:reparse -- --email you@example.com [--yes]
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { emails } from "../db/schema";
import { parseFinanceEmail } from "../lib/email/finance";
import { fileFinanceEmail } from "../lib/email/finance/record";
import { args, confirm, db, findUser, run } from "./_cli";

run(async () => {
  const a = args({ email: { type: "string" }, yes: { type: "boolean" } });
  const u = await findUser(a.email);
  const rows = await db
    .select()
    .from(emails)
    .where(
      and(
        eq(emails.userId, u.id),
        isNotNull(emails.financeSource),
        isNotNull(emails.bodyText),
        inArray(emails.financeStatus, ["none", "review"]),
      ),
    )
    .orderBy(asc(emails.receivedAt));
  if (!rows.length) return console.log("No bank emails waiting or unread. Nothing to do.");
  if (!(await confirm(`Re-read ${rows.length} bank emails of ${u.email}?`, a.yes))) return console.log("Cancelled.");

  // Forget old pairings first, so top-ups are matched again with the new results.
  await db.update(emails).set({ financeStatus: "none", parsed: null }).where(inArray(emails.id, rows.map((r) => r.id)));
  const tally = { none: 0, recorded: 0, review: 0, ignored: 0 };
  for (const e of rows) {
    const parsed = parseFinanceEmail(e.financeSource!, {
      fromAddress: e.fromAddress,
      subject: e.subject,
      text: e.bodyText!,
      receivedAt: e.receivedAt,
    });
    const status = await db.transaction((tx) => fileFinanceEmail(tx, u.id, { id: e.id, source: e.financeSource! }, parsed));
    tally[status]++;
  }
  console.log(`✓ ${tally.recorded} recorded, ${tally.review} to review, ${tally.none} not transactions.`);
});
