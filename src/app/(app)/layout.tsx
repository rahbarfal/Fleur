import { format } from "date-fns";
import { Navbar } from "@/components/nav/navbar";
import { ViewerTzProvider } from "@/components/ui/viewer-tz";
import { nowIn, zoned } from "@/lib/dates";
import { isGmailLinked } from "@/lib/queries/email";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

function greeting(hour: number) {
  if (hour < 11) return "Good morning";
  if (hour < 15) return "Good afternoon";
  if (hour < 19) return "Good evening";
  return "Good night";
}

/** Signed-in area: every page below checks the session again with requireViewer(). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pages enforce the password-change redirect themselves; the account page must still render.
  const v = await requireViewer({ allowPendingPassword: true });
  const now = nowIn(v.tz);
  const gmailConnected = await isGmailLinked(v);
  const firstName = v.name.trim().split(/\s+/)[0] ?? "";
  return (
    <ViewerTzProvider tz={v.tz}>
      {/* Padding sits on this wrapper, not <body>: opening a dialog locks scroll by
          rewriting body's padding, which would make the page jump sideways. */}
      <div className="flex min-h-dvh flex-col px-4 md:px-[10%] fit:h-dvh fit:overflow-hidden">
        <Navbar
          greeting={firstName ? `${greeting(now.getHours())}, ${firstName}` : greeting(now.getHours())}
          dateLabel={format(now, "EEEE, d MMMM yyyy")}
          gmailConnected={gmailConnected}
          user={{ name: v.name, email: v.email }}
          demoEndsLabel={v.demoEndsAt ? format(zoned(v.demoEndsAt, v.tz), "HH:mm") : null}
        />
        <main className="flex-1 pb-5 fit:min-h-0">{children}</main>
      </div>
    </ViewerTzProvider>
  );
}
