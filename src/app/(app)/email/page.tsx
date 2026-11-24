import type { Metadata } from "next";
import { PageGrid } from "@/components/dashboard/card-shell";
import { EmailSummaryCard, EmailVolumeCard, InboxCard } from "@/components/email/email-cards";
import { nowIn, parsePeriod } from "@/lib/dates";
import { getEmailDigest, getEmailSettings, getEmailVolume } from "@/lib/queries/email";
import { getCategories } from "@/lib/queries/finance";
import { getWalletOptions } from "@/lib/queries/wallets";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email · Fleur" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EmailPage({ searchParams }: { searchParams: SearchParams }) {
  const [v, sp] = await Promise.all([requireViewer(), searchParams]);
  const period = parsePeriod(sp.period, ["daily", "weekly", "monthly"] as const, "daily");
  const now = nowIn(v.tz);
  const [digest, volume, categories, wallets, settings] = await Promise.all([
    getEmailDigest(v, period, now),
    getEmailVolume(v, 14, now),
    getCategories(v),
    getWalletOptions(v),
    getEmailSettings(v),
  ]);
  const notice = typeof sp.gmail === "string" ? sp.gmail : null;

  return (
    <PageGrid className="fit:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
      <EmailSummaryCard className="fit:col-span-4 fit:row-start-1" data={digest} />
      <EmailVolumeCard className="fit:col-span-4 fit:row-start-2" days={volume} />
      <InboxCard
        key={period}
        className="md:col-span-2 fit:col-span-8 fit:col-start-5 fit:row-span-2 fit:row-start-1"
        data={digest}
        categories={categories}
        wallets={wallets}
        settings={settings}
        notice={notice}
      />
    </PageGrid>
  );
}
