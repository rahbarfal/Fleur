import "server-only";
import { timingSafeEqual } from "node:crypto";
import { decrypt, encrypt } from "./crypto";

/*
 * The OAuth round trip's secret half (state + PKCE verifier + who started it) lives in a
 * short-lived, encrypted, httpOnly cookie scoped to /api/gmail. The callback only accepts
 * Google's answer when the state matches and the same Fleur user is signed in.
 */

export const LINK_COOKIE = "fleur.gmail_link";
const TTL_MS = 10 * 60_000;

type LinkState = { s: string; v: string; u: string; e: number };

export function sealLinkState(state: string, verifier: string, userId: string): string {
  return encrypt(JSON.stringify({ s: state, v: verifier, u: userId, e: Date.now() + TTL_MS } satisfies LinkState));
}

/** The PKCE verifier when the cookie is valid for this callback, else null. */
export function openLinkState(cookie: string | undefined, state: string | null, userId: string): string | null {
  if (!cookie || !state) return null;
  let parsed: LinkState;
  try {
    parsed = JSON.parse(decrypt(cookie)) as LinkState;
  } catch {
    return null;
  }
  if (parsed.e < Date.now() || parsed.u !== userId) return null;
  const a = Buffer.from(parsed.s);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b) ? parsed.v : null;
}

export const linkCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/gmail",
  maxAge: TTL_MS / 1000,
};
