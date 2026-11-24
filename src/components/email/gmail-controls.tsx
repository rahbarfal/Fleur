"use client";

import { Mail, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { syncNow } from "@/app/actions/gmail";
import type { GmailStatus } from "@/lib/queries/email";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/primitives";

const EVERY_MS = 5 * 60_000;

/** What the Email page says after Google sent you back (?gmail=…). */
export const GMAIL_NOTICE: Record<string, { text: string; ok: boolean }> = {
  linked: { text: "Gmail linked. Fetching the last 60 days…", ok: true },
  cancelled: { text: "Linking was cancelled.", ok: false },
  scope: { text: "Fleur needs permission to read your email. Tick the box on Google's screen and try again.", ok: false },
  taken: { text: "That Gmail is already linked to another Fleur account.", ok: false },
  expired: { text: "The link request expired. Try again.", ok: false },
  error: { text: "Couldn't link Gmail. Try again.", ok: false },
  "not-configured": { text: "Gmail isn't set up on this server yet (README → Gmail).", ok: false },
  demo: { text: "Email isn't part of the demo.", ok: false },
};

/**
 * "Connect Gmail" (or "Reconnect Gmail"). Gone once a working link exists.
 * It's a plain link: the server sends you on to Google's consent screen.
 */
export function ConnectGmailButton({ gmail, className }: { gmail: GmailStatus; className?: string }) {
  if (gmail.linked && !gmail.needsReconnect) return null;
  const label = gmail.needsReconnect ? "Reconnect Gmail" : "Connect Gmail";
  const base = cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-white transition hover:bg-ink-2",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    className,
  );
  if (gmail.demo) {
    return (
      <span className={cn(base, "cursor-not-allowed opacity-50")} title="Email isn't part of the demo">
        <Mail className="size-4" /> {label}
      </span>
    );
  }
  if (!gmail.configured) {
    return (
      <span className={cn(base, "cursor-not-allowed opacity-50")} title="Add the Google keys to .env.local first (README → Gmail)">
        <Mail className="size-4" /> {label}
      </span>
    );
  }
  return (
    <a href="/api/gmail/connect" className={base}>
      <Mail className="size-4" /> {label}
    </a>
  );
}

/** The connect panel for an inbox with no (working) link. */
export function ConnectGmailPanel({ gmail }: { gmail: GmailStatus }) {
  if (gmail.demo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-10 text-center fit:min-h-0 fit:flex-1">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-soft text-ink-2">
          <Mail className="size-5" />
        </span>
        <div>
          <p className="text-[15px] font-medium text-ink">Email isn&apos;t part of the demo</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
            In the real app you link your Gmail (read-only). Fleur sorts your inbox into categories and turns bank and
            e-wallet emails into transactions. It&apos;s still being tuned on real emails.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-10 text-center fit:min-h-0 fit:flex-1">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-soft text-ink-2">
        <Mail className="size-5" />
      </span>
      <div>
        <p className="text-[15px] font-medium text-ink">
          {gmail.needsReconnect ? "Google stopped Fleur's access to Gmail" : "Link your Gmail"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
          Read-only. Fleur keeps sender, subject and preview; full text only for bank, e-wallet and Ajaib emails, so it can
          record your transactions.
        </p>
      </div>
      <ConnectGmailButton gmail={gmail} />
    </div>
  );
}

/**
 * Keeps the inbox fresh: syncs when the page opens (if the last sync is older than
 * 5 minutes), every 5 minutes while the tab is visible, and keeps going while the
 * first 60-day backfill is still running. With `show`, also renders
 * "you@gmail.com · synced 2 min ago" and a sync button.
 */
export function GmailSync({ gmail, show = false }: { gmail: GmailStatus; show?: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const active = gmail.linked && !gmail.needsReconnect;

  const sync = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      const res = await syncNow();
      if (!res.ok) setError(res.error);
      else {
        setError(res.result.status === "error" ? "Sync failed. Fleur will try again." : null);
        if (res.result.added || res.result.status !== "ok") router.refresh();
      }
    } catch {
      setError("Sync failed. Fleur will try again.");
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [router]);

  // On open, and right after each refresh while the first backfill is still running.
  useEffect(() => {
    if (!active) return;
    const stale = !gmail.lastSyncAt || Date.now() - gmail.lastSyncAt > EVERY_MS;
    if (!gmail.backfillDone || stale) {
      const t = window.setTimeout(sync, gmail.backfillDone ? 0 : 800);
      return () => window.clearTimeout(t);
    }
  }, [active, gmail.backfillDone, gmail.lastSyncAt, sync]);

  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < EVERY_MS - 1000) return;
      last = Date.now();
      void sync();
    };
    const timer = window.setInterval(tick, EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, sync]);

  if (!show || !active) return null;
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted">
      <span className="min-w-0 truncate" title={gmail.lastError ?? undefined}>
        {gmail.address} ·{" "}
        {error ? (
          <span className="text-down">{error}</span>
        ) : syncing ? (
          gmail.backfillDone ? "syncing…" : `fetching the last 60 days… (${gmail.emailCount})`
        ) : gmail.lastSyncAgo ? (
          `synced ${gmail.lastSyncAgo}`
        ) : (
          "not synced yet"
        )}
      </span>
      <IconButton label="Sync now" onClick={() => void sync()} disabled={syncing}>
        <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
      </IconButton>
    </span>
  );
}
