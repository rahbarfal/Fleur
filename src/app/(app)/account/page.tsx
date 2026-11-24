import type { Metadata } from "next";
import { and, desc, eq, gt } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/db";
import { session } from "@/db/schema";
import { PageGrid } from "@/components/dashboard/card-shell";
import { timeAgo, zoned } from "@/lib/dates";
import { getGmailStatus } from "@/lib/queries/email";
import { timeZoneOptions } from "@/lib/timezones";
import { requireViewer } from "@/lib/viewer";
import { DemoCard, GmailCard, PasswordCard, ProfileCard, SessionsCard, type SessionView } from "./account-cards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account · Fleur" };

/** "Safari on macOS" from a user-agent string (good enough to recognise your own devices). */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function AccountPage() {
  const v = await requireViewer({ allowPendingPassword: true });
  const [rows, gmail] = await Promise.all([
    db
      .select()
      .from(session)
      .where(and(eq(session.userId, v.id), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt)),
    getGmailStatus(v),
  ]);

  const sessions: SessionView[] = rows.map((s) => ({
    id: s.id,
    device: deviceLabel(s.userAgent),
    ip: s.ipAddress,
    current: s.id === v.sessionId,
    signedInLabel: format(zoned(s.createdAt, v.tz), "d MMM yyyy, HH:mm"),
    activeAgo: timeAgo(s.updatedAt),
  }));

  return (
    <PageGrid className="fit:grid-rows-[auto_minmax(0,1fr)]">
      <ProfileCard
        className="fit:col-span-4 fit:row-span-2"
        name={v.name}
        email={v.email}
        timezone={v.tz}
        timezones={timeZoneOptions()}
      />
      {v.isDemo && v.demoEndsAt ? (
        <DemoCard className="fit:col-span-4 fit:row-span-2" endsLabel={format(zoned(v.demoEndsAt, v.tz), "HH:mm")} />
      ) : (
        <>
          <PasswordCard className="fit:col-span-4 fit:row-span-2" mustChange={v.mustChangePassword} />
          <GmailCard className="fit:col-span-4 fit:col-start-9 fit:row-start-1" gmail={gmail} />
        </>
      )}
      <SessionsCard
        className={
          v.isDemo
            ? "md:col-span-2 fit:col-span-4 fit:col-start-9 fit:row-span-2 fit:row-start-1"
            : "md:col-span-2 fit:col-span-4 fit:col-start-9 fit:row-start-2"
        }
        sessions={sessions}
      />
    </PageGrid>
  );
}
