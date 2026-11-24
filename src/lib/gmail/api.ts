import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gmailAccounts, type GmailAccount } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { GOOGLE, GoogleAuthError, refreshAccess } from "./oauth";

/* Minimal Gmail REST client (no SDK): list + get messages, profile. */

export type GmailHeader = { name: string; value: string };
export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

/** A valid access token for this account, refreshed (and saved) when it's about to expire. */
async function accessToken(acc: GmailAccount, force = false): Promise<string> {
  if (!force && acc.accessToken && acc.accessExpiresAt && acc.accessExpiresAt.getTime() > Date.now() + 60_000) {
    return decrypt(acc.accessToken);
  }
  const t = await refreshAccess(decrypt(acc.refreshToken));
  const expires = new Date(Date.now() + t.expires_in * 1000);
  const set: Partial<GmailAccount> = { accessToken: encrypt(t.access_token), accessExpiresAt: expires };
  if (t.refresh_token) set.refreshToken = encrypt(t.refresh_token);
  await db.update(gmailAccounts).set(set).where(eq(gmailAccounts.userId, acc.userId));
  Object.assign(acc, set);
  return t.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function gmailClient(acc: GmailAccount) {
  async function get<T>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
    const u = new URL(`${GOOGLE.gmail}${path}`);
    for (const [k, v] of Object.entries(params)) for (const one of [v].flat()) u.searchParams.append(k, one);
    let refreshed = false;
    let forceRefresh = false;
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken(acc, forceRefresh);
      forceRefresh = false;
      const res = await fetch(u, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && !refreshed) {
        refreshed = forceRefresh = true; // token went stale: refresh once
        continue;
      }
      if (res.status === 401) throw new GoogleAuthError("Google rejected the access token");
      if ((res.status === 429 || res.status === 403 || res.status >= 500) && attempt < 3) {
        await sleep(500 * 2 ** attempt); // rate limited / flaky: back off
        continue;
      }
      throw new Error(`Gmail ${path} failed (${res.status})`);
    }
  }

  return {
    profile: () => get<{ emailAddress: string; messagesTotal: number; historyId: string }>("/profile"),
    list: (q: string, pageToken?: string) =>
      get<{ messages?: { id: string }[]; nextPageToken?: string }>("/messages", {
        q,
        maxResults: "100",
        ...(pageToken ? { pageToken } : {}),
      }),
    metadata: (id: string) =>
      get<GmailMessage>(`/messages/${encodeURIComponent(id)}`, {
        format: "metadata",
        metadataHeaders: ["From", "Subject", "List-Unsubscribe", "Precedence"],
      }),
    full: (id: string) => get<GmailMessage>(`/messages/${encodeURIComponent(id)}`, { format: "full" }),
  };
}

/** Profile lookup with a fresh access token (right after the OAuth callback). */
export async function profileWithToken(token: string) {
  const res = await fetch(`${GOOGLE.gmail}/profile`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Gmail profile failed (${res.status})`);
  return (await res.json()) as { emailAddress: string };
}

/* ------------------------------------------------------------------ message parts */

export function header(m: GmailMessage, name: string): string {
  const h = m.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

/** `"Name" <a@b.c>` / `a@b.c` → name + address. */
export function parseFrom(from: string): { name: string; address: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const address = (m ? m[2] : from).trim().toLowerCase();
  const name = (m?.[1] ?? "").trim() || address.split("@")[0];
  return { name, address };
}

function decodePart(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

/** The email's text: text/plain when there is one, else HTML (converted by the caller). */
export function bodyOf(part: GmailPart | undefined): { text: string; html: string } {
  let text = "";
  let html = "";
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.filename) return; // attachments
    if (p.mimeType === "text/plain" && p.body?.data && !text) text = decodePart(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = decodePart(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(part);
  return { text, html };
}

/** Runs `fn` over items with at most `limit` in flight. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
