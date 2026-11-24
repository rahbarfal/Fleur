import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { isTimeZone } from "@/lib/timezones";

/** The signed-in user, as every query and action sees them. */
export type Viewer = {
  id: string;
  name: string;
  email: string;
  /** IANA timezone used for days, months and "now". */
  tz: string;
  mustChangePassword: boolean;
  sessionId: string;
  /** A "Try the demo" sandbox: no Gmail, deleted with its data at `demoEndsAt`. */
  isDemo: boolean;
  demoEndsAt: Date | null;
};

/** Reads the session from the database (once per request). Null when signed out or the demo has ended. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as typeof s.user & {
    timezone?: string;
    mustChangePassword?: boolean;
    isDemo?: boolean;
    demoExpiresAt?: Date | string | null;
  };
  const isDemo = Boolean(u.isDemo);
  const demoEndsAt = isDemo && u.demoExpiresAt ? new Date(u.demoExpiresAt) : null;
  // An ended demo counts as signed out even before the cleanup cron deletes it.
  if (isDemo && (!demoEndsAt || demoEndsAt.getTime() <= Date.now())) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    tz: u.timezone && isTimeZone(u.timezone) ? u.timezone : DEFAULT_TIMEZONE,
    mustChangePassword: Boolean(u.mustChangePassword),
    sessionId: s.session.id,
    isDemo,
    demoEndsAt,
  };
});

/**
 * The authorization check. Call it at the top of every page and server action
 * (in actions: before the try/catch, so the redirect isn't swallowed).
 * Middleware only does a cheap cookie check; this is the real one.
 */
export async function requireViewer(opts: { allowPendingPassword?: boolean } = {}): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.mustChangePassword && !opts.allowPendingPassword) redirect("/account");
  return v;
}
