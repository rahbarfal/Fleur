import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gmailAccounts } from "@/db/schema";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncGmail } from "@/lib/gmail/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily Vercel cron (vercel.json): syncs every linked inbox so bank emails are recorded even if Fleur isn't opened. */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accounts = await db.select({ userId: gmailAccounts.userId }).from(gmailAccounts).where(eq(gmailAccounts.status, "ok"));
  const budget = Math.max(5_000, Math.floor(50_000 / Math.max(1, accounts.length)));
  const results = [];
  for (const a of accounts) {
    const r = await syncGmail(a.userId, budget);
    results.push({ status: r.status, added: r.added, recorded: r.recorded, review: r.review });
  }
  return NextResponse.json({ synced: results.length, results });
}
