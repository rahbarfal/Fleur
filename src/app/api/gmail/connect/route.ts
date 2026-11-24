import { NextResponse, type NextRequest } from "next/server";
import { LINK_COOKIE, linkCookieOptions, sealLinkState } from "@/lib/gmail/link";
import { authUrl, gmailConfigured, newPkce } from "@/lib/gmail/oauth";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** "Connect Gmail": sends you to Google's consent screen (read-only access). */
export async function GET(request: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.redirect(new URL("/login?next=/email", request.url));
  if (v.mustChangePassword) return NextResponse.redirect(new URL("/account", request.url));
  if (v.isDemo) return NextResponse.redirect(new URL("/email?gmail=demo", request.url));
  if (!gmailConfigured()) return NextResponse.redirect(new URL("/email?gmail=not-configured", request.url));

  const { state, verifier, challenge } = newPkce();
  const res = NextResponse.redirect(authUrl(state, challenge));
  res.cookies.set(LINK_COOKIE, sealLinkState(state, verifier, v.id), linkCookieOptions);
  return res;
}
