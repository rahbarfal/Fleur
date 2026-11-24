import { NextResponse, type NextRequest } from "next/server";

/** Better Auth's session cookie ("__Secure-" prefixed over HTTPS in production). */
const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

/*
 * Fast first gate: no session cookie → /login. It only checks that a cookie
 * exists; the real check (is the session valid, whose data is this) happens in
 * requireViewer() on every page and server action.
 */
export function middleware(request: NextRequest) {
  if (SESSION_COOKIES.some((name) => request.cookies.get(name)?.value)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, the auth API, the cron endpoint (it checks CRON_SECRET) and static files.
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|icon.svg|favicon.ico|robots.txt).*)"],
};
