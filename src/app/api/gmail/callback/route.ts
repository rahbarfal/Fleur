import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { gmailAccounts } from "@/db/schema";
import { profileWithToken } from "@/lib/gmail/api";
import { encrypt } from "@/lib/gmail/crypto";
import { LINK_COOKIE, openLinkState } from "@/lib/gmail/link";
import { GMAIL_SCOPE, exchangeCode, revokeToken } from "@/lib/gmail/oauth";
import { BACKFILL_DAYS } from "@/lib/gmail/sync";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Google sends you back here after the consent screen. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/email?gmail=${result}`, request.url));
    res.cookies.set(LINK_COOKIE, "", { path: "/api/gmail", maxAge: 0 });
    return res;
  };

  const v = await getViewer();
  if (!v) return NextResponse.redirect(new URL("/login?next=/email", request.url));

  const verifier = openLinkState(request.cookies.get(LINK_COOKIE)?.value, url.searchParams.get("state"), v.id);
  if (!verifier) return back("expired");
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code) return back("error");

  try {
    const t = await exchangeCode(code, verifier);
    if (!t.scope.split(" ").includes(GMAIL_SCOPE)) {
      await revokeToken(t.access_token);
      return back("scope");
    }
    if (!t.refresh_token) return back("error");

    const { emailAddress } = await profileWithToken(t.access_token);
    const address = emailAddress.trim().toLowerCase();
    const [taken] = await db
      .select({ userId: gmailAccounts.userId })
      .from(gmailAccounts)
      .where(and(sql`lower(${gmailAccounts.address}) = ${address}`, ne(gmailAccounts.userId, v.id)));
    if (taken) {
      await revokeToken(t.refresh_token);
      return back("taken");
    }

    const [existing] = await db.select({ address: gmailAccounts.address }).from(gmailAccounts).where(eq(gmailAccounts.userId, v.id));
    const fresh = {
      backfillSince: new Date(Date.now() - BACKFILL_DAYS * 86_400_000),
      backfillDone: false,
      backfillPageToken: null,
    };
    const tokens = {
      address,
      refreshToken: encrypt(t.refresh_token),
      accessToken: encrypt(t.access_token),
      accessExpiresAt: new Date(Date.now() + t.expires_in * 1000),
      scope: t.scope,
      status: "ok" as const,
      lastError: null,
      syncStartedAt: null,
    };
    await db
      .insert(gmailAccounts)
      .values({ userId: v.id, ...tokens, ...fresh })
      .onConflictDoUpdate({
        target: gmailAccounts.userId,
        // Reconnecting the same inbox keeps its sync position; a different inbox starts over.
        set: existing?.address === address ? tokens : { ...tokens, ...fresh },
      });
    return back("linked");
  } catch (err) {
    console.error("Gmail link failed", err);
    return back("error");
  }
}
