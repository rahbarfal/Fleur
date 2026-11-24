import { PageGrid } from "@/components/dashboard/card-shell";
import { EmailDigestCard } from "@/components/dashboard/email-digest-card";
import { CashFlowCard, SpendingCard } from "@/components/dashboard/finance-cards";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { NotesCard } from "@/components/dashboard/notes-card";
import { WorkoutCard } from "@/components/dashboard/workout-cards";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { monthKey, nowIn, parsePeriod } from "@/lib/dates";
import { getEmailDigest } from "@/lib/queries/email";
import {
  getCashFlow,
  getCategories,
  getDailyCalendar,
  getWeeklyCashFlow,
  weekIndexOf,
  getRecentActivity,
  getSpending,
  getYearlyCashFlow,
} from "@/lib/queries/finance";
import { getNotes } from "@/lib/queries/notes";
import { getWallets } from "@/lib/queries/wallets";
import { getMonthCalendar, getMonthProgress } from "@/lib/queries/workout";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `?cfm=2026-10` for the Daily calendar; missing, invalid or future → the current month. */
function calendarMonth(raw: unknown, now: Date): { year: number; month: number } {
  const current = { year: now.getFullYear(), month: now.getMonth() };
  const m = typeof raw === "string" ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  if (!m) return current;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11 || year < 2000) return current;
  return year * 12 + month > current.year * 12 + current.month ? current : { year, month };
}

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const [v, sp] = await Promise.all([requireViewer(), searchParams]);
  const now = nowIn(v.tz);

  const year = Number(sp.year) || now.getFullYear();
  const cashFlowView = sp.cf === "weekly" || sp.cf === "monthly" || sp.cf === "yearly" ? sp.cf : "daily";
  const emailPeriod = parsePeriod(sp.email, ["daily", "weekly", "monthly"] as const, "daily");
  const cal = calendarMonth(sp.cfm, now);

  const [categories, spending, recent, { wallets, stocks }, cashFlow, weekly, daily, yearly, notes, emailDigest, workoutProgress, workoutCalendar] =
    await Promise.all([
      getCategories(v),
      getSpending(v, now),
      getRecentActivity(v),
      getWallets(v, now),
      getCashFlow(v, year, null, null, now),
      cashFlowView === "weekly" ? getWeeklyCashFlow(v, now.getFullYear(), now.getMonth(), null, null, now) : [],
      cashFlowView === "daily" ? getDailyCalendar(v, cal.year, cal.month, null, null, now) : null,
      cashFlowView === "yearly" ? getYearlyCashFlow(v, null, null, now) : [],
      getNotes(v),
      getEmailDigest(v, emailPeriod, now),
      getMonthProgress(v, now),
      getMonthCalendar(v, now.getFullYear(), now.getMonth(), now),
    ]);

  return (
    <PageGrid className="fit:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
      {stocks.length > 0 && <AutoRefresh minutes={5} />}
      <SpendingCard className="fit:col-span-3" data={{ ...spending, monthKey: monthKey(now) }} />
      <CashFlowCard
        className="md:col-span-2 fit:col-span-6"
        data={cashFlow}
        year={year}
        view={cashFlowView}
        weekly={weekly}
        daily={daily}
        yearly={yearly}
        todayKey={weekIndexOf(v.tz, now.getFullYear(), now.getMonth(), now.getDate())}
        wallets={wallets}
        stocks={stocks}
      />
      <NotesCard className="fit:col-span-3" notes={notes} />
      <RecentActivityCard
        className="fit:col-span-4"
        outgoing={recent.outgoing}
        incoming={recent.incoming}
        categories={categories}
        wallets={wallets}
      />
      <EmailDigestCard className="fit:col-span-4" data={emailDigest} />
      <WorkoutCard
        className="md:col-span-2 fit:col-span-4"
        progress={workoutProgress}
        calendar={workoutCalendar}
      />
    </PageGrid>
  );
}
