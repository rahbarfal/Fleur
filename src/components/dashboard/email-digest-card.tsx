"use client";

import { Banknote, Briefcase, Mail } from "lucide-react";
import type { Period } from "@/lib/dates";
import type { getEmailDigest } from "@/lib/queries/email";
import { ConnectGmailButton, GmailSync } from "@/components/email/gmail-controls";
import { cn } from "@/lib/cn";
import { HatchedBars } from "@/components/charts/hatched-bars";
import { EmptyState, PillSelect, TrendText } from "@/components/ui/primitives";
import { useSearchParamSetter } from "@/components/ui/use-search-param";
import { CardShell, OpenLink } from "./card-shell";

export type EmailDigestData = Awaited<ReturnType<typeof getEmailDigest>>;

export const PERIOD_TEXT: Record<Period, string> = {
  daily: "Received today",
  weekly: "Received this week",
  monthly: "Received this month",
};

export function PeriodSelect({ value, param }: { value: Period; param: string }) {
  const { set } = useSearchParamSetter();
  return (
    <PillSelect aria-label="Period" value={value} onChange={(e) => set(param, e.target.value)}>
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
    </PillSelect>
  );
}

export function EmailDigestCard({ data, className }: { data: EmailDigestData; className?: string }) {
  const { pending } = useSearchParamSetter();

  return (
    <CardShell
      icon={<Mail />}
      title="Email Digest"
      className={className}
      actions={
        <>
          <PeriodSelect value={data.period} param="email" />
          <OpenLink href={`/email?period=${data.period}`} label="Open Email" />
        </>
      }
    >
      <div className={cn("flex flex-col transition-opacity fit:min-h-0 fit:flex-1", pending && "opacity-50")}>
        <div className="flex shrink-0 items-center justify-between gap-3 text-[14px]">
          <span className="text-ink-2">{PERIOD_TEXT[data.period]} :</span>
          <span className="flex items-center gap-2">
            <span className="font-medium text-ink tabular">{data.total} emails</span>
            <TrendText value={data.change} />
          </span>
        </div>
        <p className="mt-1 flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
          <Briefcase className="size-3.5" /> {data.jobseekCount} job search
          {data.interviews ? ` · ${data.interviews} interview${data.interviews === 1 ? "" : "s"}` : ""}
          <span aria-hidden>·</span>
          <Banknote className="size-3.5" /> {data.financialCount} finance
          {data.review.length ? ` · ${data.review.length} to review` : ""}
        </p>

        <div className="mt-4 fit:min-h-0 fit:flex-1">
          {data.top3.length ? (
            <HatchedBars label="Top email categories" items={data.top3.map((c) => ({ label: c.label, value: c.count }))} />
          ) : data.gmail.linked && !data.gmail.needsReconnect ? (
            <EmptyState>No emails in this period.</EmptyState>
          ) : data.gmail.demo ? (
            <EmptyState>Email isn&apos;t part of the demo. In the real app, linked Gmail is sorted into categories here.</EmptyState>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-4 py-5 text-center">
              <p className="text-[13px] text-muted">
                {data.gmail.needsReconnect ? "Google stopped Fleur's access to Gmail." : "Link Gmail to sort your mail and record bank emails."}
              </p>
              <ConnectGmailButton gmail={data.gmail} />
            </div>
          )}
        </div>
        <GmailSync gmail={data.gmail} />
      </div>
    </CardShell>
  );
}
