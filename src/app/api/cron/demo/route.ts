import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { cronAuthorized } from "@/lib/cron-auth";
import { deleteExpiredDemos } from "@/lib/demo/demo";

export const dynamic = "force-dynamic";

/**
 * Daily Vercel cron (vercel.json): deletes ended demo sandboxes and their data.
 * A backup only. On Vercel's Hobby plan crons run once a day, so the hourly
 * cleanup is Supabase pg_cron (npm run demo:cron), and every new demo also clears ended ones.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const deleted = await deleteExpiredDemos(db);
  return NextResponse.json({ deleted });
}
