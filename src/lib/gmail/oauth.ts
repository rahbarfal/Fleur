import "server-only";
import { createHash, randomBytes } from "node:crypto";

/*
 * Google OAuth for linking Gmail (separate from signing in to Fleur).
 * Read-only scope, offline access (refresh token), PKCE.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Test-only: point Google calls at a local fake (e.g. http://127.0.0.1:4555).
 * Ignored on Vercel production deployments.
 */
const override = process.env.VERCEL_ENV === "production" ? undefined : process.env.GOOGLE_API_OVERRIDE;
export const GOOGLE = {
  auth: override ? `${override}/o/oauth2/v2/auth` : "https://accounts.google.com/o/oauth2/v2/auth",
  token: override ? `${override}/token` : "https://oauth2.googleapis.com/token",
  revoke: override ? `${override}/revoke` : "https://oauth2.googleapis.com/revoke",
  gmail: override ? `${override}/gmail/v1/users/me` : "https://gmail.googleapis.com/gmail/v1/users/me",
};

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GMAIL_TOKEN_KEY);
}

function client() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set (see .env.example).");
  return { id, secret };
}

export function redirectUri(): string {
  return new URL("/api/gmail/callback", process.env.BETTER_AUTH_URL ?? "http://localhost:3000").toString();
}

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(24).toString("base64url") };
}

export function authUrl(state: string, challenge: string): string {
  const u = new URL(GOOGLE.auth);
  u.search = new URLSearchParams({
    client_id: client().id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    // Always show consent so Google returns a refresh token, even on a re-link.
    prompt: "consent",
    include_granted_scopes: "false",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

/** Google said the refresh token is no longer valid (revoked, expired, password change). */
export class GoogleAuthError extends Error {}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = client();
  const res = await fetch(GOOGLE.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant") throw new GoogleAuthError("Google access was revoked or expired");
    throw new Error(`Google token request failed (${res.status} ${json.error ?? ""})`.trim());
  }
  return json as TokenResponse;
}

export function exchangeCode(code: string, verifier: string) {
  return tokenRequest({ code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri() });
}

export function refreshAccess(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

/** Best effort: tells Google to drop Fleur's access. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(GOOGLE.revoke, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      cache: "no-store",
    });
  } catch {
    /* already gone or offline; the row is deleted anyway */
  }
}
