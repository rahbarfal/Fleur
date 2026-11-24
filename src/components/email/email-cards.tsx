"use client";

import { Banknote, Briefcase, CalendarDays, FolderInput, Inbox, Mail, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteRule, forgetWalletLink, ignoreReview, moveEmail, undoRecorded, applyTrade } from "@/app/actions/gmail";
import type { Category } from "@/db/schema";
import {
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_LABEL,
  JOB_STAGES,
  JOB_STAGE_LABEL,
  type EmailCategory,
  type JobStage,
} from "@/lib/constants";
import type { EmailSettings, EmailView, ReviewItem } from "@/lib/queries/email";
import { cn } from "@/lib/cn";
import { formatIDR } from "@/lib/format";
import { niceStep } from "@/components/charts/hatched-bars";
import { CardShell } from "@/components/dashboard/card-shell";
import { PERIOD_TEXT, PeriodSelect, type EmailDigestData } from "@/components/dashboard/email-digest-card";
import { ReviewTransactionDialog, type WalletLite } from "@/components/forms/finance-dialogs";
import { Modal } from "@/components/ui/modal";
import { Pager } from "@/components/ui/pager";
import { Button, EmptyState, FormError, IconButton, PillSelect, Segmented, TrendBadge } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { useFitCount, usePaged } from "@/components/ui/use-fit";
import { useSearchParamSetter } from "@/components/ui/use-search-param";
import { ConnectGmailButton, ConnectGmailPanel, GMAIL_NOTICE, GmailSync } from "./gmail-controls";

/** Job search stands out, finance next, the rest is background. */
const CATEGORY_HATCH: Record<EmailCategory, string> = {
  jobseek: "hatch-dark",
  finance: "hatch-mid",
  work: "hatch-light",
  personal: "hatch-light",
  social: "hatch-light",
  updates: "hatch-light",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ Summary */

export function EmailSummaryCard({ data, className }: { data: EmailDigestData; className?: string }) {
  const { pending } = useSearchParamSetter();
  const max = Math.max(...data.byCategory.map((c) => c.count), 1);
  const extras = [data.interviews && plural(data.interviews, "interview"), data.offers && plural(data.offers, "offer")].filter(Boolean);

  return (
    <CardShell icon={<Mail />} title="Digest" className={className} actions={<PeriodSelect value={data.period} param="period" />}>
      <div className={cn("flex flex-col transition-opacity fit:min-h-0 fit:flex-1", pending && "opacity-50")}>
        <div className="flex shrink-0 items-center gap-3">
          <p className="text-[30px] font-semibold leading-none tracking-tight tabular">{data.total}</p>
          <TrendBadge value={data.change} />
          <p className="text-[14px] text-ink-2">emails</p>
        </div>
        <p className="mt-1.5 shrink-0 text-[13px] text-muted">
          {PERIOD_TEXT[data.period]} · <Briefcase className="inline size-3.5 align-[-2px]" /> {data.jobseekCount} job search
          {extras.length ? ` (${extras.join(", ")})` : ""} · <Banknote className="inline size-3.5 align-[-2px]" />{" "}
          {data.financialCount} finance
        </p>

        {data.total === 0 ? (
          <div className="mt-4">
            <EmptyState>
              {data.gmail.linked ? "No emails in this period." : data.gmail.demo ? "Email isn't part of the demo." : "Link Gmail to see your digest."}
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col justify-between gap-2 fit:min-h-0 fit:flex-1">
            {data.byCategory.map((c) => (
              <li key={c.category} className="grid grid-cols-[84px_minmax(0,1fr)_28px] items-center gap-3 text-[13px]">
                <span className="truncate text-ink-2">{c.label}</span>
                <span className="h-5 overflow-hidden rounded-md bg-soft">
                  {c.count > 0 && (
                    <span
                      className={cn("block h-full rounded-md", CATEGORY_HATCH[c.category])}
                      style={{ width: `${Math.max(4, Math.round((c.count / max) * 100))}%` }}
                    />
                  )}
                </span>
                <span className={cn("text-right font-medium tabular", !c.count && "text-muted")}>{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Daily volume */

export type VolumeDay = {
  key: string;
  weekday: string;
  day: string;
  label: string;
  count: number;
  jobseek: number;
  finance: number;
  isToday: boolean;
};

export function EmailVolumeCard({ days, className }: { days: VolumeDay[]; className?: string }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const step = niceStep(max / 3);
  const top = step * Math.ceil(max / step);
  const total = days.reduce((s, d) => s + d.count, 0);
  const pct = (part: number, of: number) => `${of ? Math.round((part / of) * 100) : 0}%`;

  return (
    <CardShell icon={<CalendarDays />} title="Daily Volume" className={className}>
      <div className="flex shrink-0 items-center justify-between gap-2 text-[13px]">
        <span className="text-muted">Last {days.length} days</span>
        <span className="flex items-center gap-3 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] hatch-dark" /> Job search
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] hatch-mid" /> Finance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] hatch-light" /> Other
          </span>
          <span className="font-medium text-ink tabular">{total}</span>
        </span>
      </div>
      <figure
        aria-label="Emails per day"
        className="mt-3 grid h-[200px] grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-2 fit:h-auto fit:min-h-0 fit:flex-1"
      >
        <div className="flex flex-col justify-between text-right text-[11px] leading-none text-muted tabular" aria-hidden>
          <span>{top}</span>
          <span>{top / 2}</span>
          <span>0</span>
        </div>
        <div className="relative my-[5px]">
          {[0, 0.5, 1].map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-[#dcdde0]" style={{ bottom: `${t * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {days.map((d) => (
              <div
                key={d.key}
                title={`${d.label}: ${d.count} emails (${d.jobseek} job search, ${d.finance} finance)`}
                className={cn(
                  "flex flex-1 flex-col justify-end overflow-hidden rounded-t-md rounded-b-sm",
                  d.isToday && "ring-2 ring-accent/50 ring-offset-1",
                )}
                style={{ height: pct(d.count, top) }}
              >
                <span className="hatch-light block flex-1" />
                <span className="hatch-mid block" style={{ height: pct(d.finance, d.count) }} />
                <span className="hatch-dark block" style={{ height: pct(d.jobseek, d.count) }} />
              </div>
            ))}
          </div>
        </div>
        <div />
        <div className="mt-1.5 flex gap-1">
          {days.map((d) => (
            <span
              key={d.key}
              className={cn("flex-1 text-center text-[10px] leading-tight", d.isToday ? "font-semibold text-ink" : "text-muted")}
            >
              {d.weekday.slice(0, 2)}
              <br />
              {d.day}
            </span>
          ))}
        </div>
      </figure>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Inbox */

type Filter = EmailCategory | "all" | "review";

export function InboxCard({
  data,
  categories,
  wallets,
  settings,
  notice,
  className,
}: {
  data: EmailDigestData;
  categories: Category[];
  wallets: WalletLite[];
  settings: EmailSettings;
  notice: string | null;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [stage, setStage] = useState<JobStage | "all">("all");
  const [moving, setMoving] = useState<EmailView | null>(null);
  const [reviewing, setReviewing] = useState<ReviewItem | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const undo = useAction(undoRecorded);
  const ignore = useAction(ignoreReview);

  const { gmail } = data;
  const working = gmail.linked && !gmail.needsReconnect;
  const showPanel = !working && gmail.emailCount === 0;
  const shown =
    filter === "all"
      ? data.list
      : filter === "review"
        ? []
        : data.list.filter((e) => e.category === filter && (filter !== "jobseek" || stage === "all" || e.jobStage === stage));
  const items = filter === "review" ? data.review : shown;
  const [ref, count] = useFitCount<HTMLUListElement>(60, 8, 10);
  const p = usePaged<EmailView | ReviewItem>(items, count);
  const pick = (f: Filter) => {
    setFilter(f);
    setStage("all");
    p.setPage(0);
  };
  const reviewFor = (emailId: number) => data.review.find((r) => r.emailId === emailId || r.pairEmailId === emailId) ?? null;
  const n = notice ? GMAIL_NOTICE[notice] : undefined;

  return (
    <CardShell
      icon={<Inbox />}
      title="Inbox"
      className={className}
      actions={
        working ? (
          <>
            <GmailSync gmail={gmail} show />
            <IconButton label="Rules" onClick={() => setRulesOpen(true)}>
              <SlidersHorizontal className="size-4" />
            </IconButton>
          </>
        ) : (
          !showPanel && <ConnectGmailButton gmail={gmail} className="h-8 text-[13px]" />
        )
      }
    >
      {n && (
        <p
          role="status"
          className={cn("mb-3 shrink-0 rounded-lg px-3 py-2 text-[13px]", n.ok ? "bg-up-soft text-up" : "bg-down-soft text-down")}
        >
          {n.text}
        </p>
      )}

      {showPanel ? (
        <ConnectGmailPanel gmail={gmail} />
      ) : (
        <>
          <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5" role="tablist" aria-label="Category">
            {[{ category: "all" as const, label: "All", count: data.total }, ...data.byCategory].map((c) => (
              <Chip key={c.category} active={filter === c.category} onClick={() => pick(c.category)}>
                {c.label} <span className="tabular opacity-60">{c.count}</span>
              </Chip>
            ))}
            {data.review.length > 0 && (
              <Chip active={filter === "review"} onClick={() => pick("review")} accent>
                To review <span className="tabular opacity-70">{data.review.length}</span>
              </Chip>
            )}
            {filter === "jobseek" && (
              <PillSelect
                aria-label="Stage"
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value as JobStage | "all");
                  p.setPage(0);
                }}
              >
                <option value="all">All stages</option>
                {JOB_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {JOB_STAGE_LABEL[s]}
                  </option>
                ))}
              </PillSelect>
            )}
          </div>
          <ul ref={ref} className="flex flex-col gap-2 overflow-hidden fit:min-h-0 fit:flex-1">
            {!items.length ? (
              <EmptyState>{filter === "review" ? "Nothing to review." : "No emails here."}</EmptyState>
            ) : filter === "review" ? (
              (p.pageItems as ReviewItem[]).map((r) => (
                <ReviewRow key={r.emailId} r={r} onReview={() => setReviewing(r)} onIgnore={() => ignore.run(r.emailId)} busy={ignore.pending} />
              ))
            ) : (
              (p.pageItems as EmailView[]).map((e) => (
                <EmailRow
                  key={e.id}
                  e={e}
                  onMove={() => setMoving(e)}
                  onUndo={() => undo.run(e.id)}
                  onReview={() => {
                    const r = reviewFor(e.id);
                    if (r) setReviewing(r);
                  }}
                  busy={undo.pending}
                />
              ))
            )}
          </ul>
          <FormError error={undo.error ?? ignore.error} />
          <Pager {...p} noun={filter === "review" ? "to review" : "emails"} />
        </>
      )}

      <MoveDialog email={moving} onClose={() => setMoving(null)} />
      <ReviewDialog item={reviewing} onClose={() => setReviewing(null)} categories={categories} wallets={wallets} />
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} settings={settings} />
    </CardShell>
  );
}

function Chip({ active, accent, onClick, children }: { active: boolean; accent?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[13px] transition",
        active
          ? "border-ink bg-ink text-white"
          : accent
            ? "border-accent/40 bg-accent/10 text-ink hover:bg-accent/20"
            : "border-line text-ink-2 hover:bg-soft",
      )}
    >
      {children}
    </button>
  );
}

function Avatar({ category, name }: { category: EmailCategory; name: string }) {
  const icon = category === "jobseek" ? <Briefcase className="size-4" /> : category === "finance" ? <Banknote className="size-4" /> : null;
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
        icon ? "bg-ink text-white" : "bg-soft text-ink-2",
      )}
      aria-hidden
    >
      {icon ?? name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StageTag({ stage }: { stage: JobStage }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-px text-[11px] font-medium",
        stage === "offer" && "bg-up-soft text-up",
        stage === "rejected" && "bg-down-soft text-down",
        (stage === "interview" || stage === "assessment") && "bg-accent/15 text-ink",
        (stage === "applied" || stage === "alert") && "bg-soft text-ink-2",
      )}
    >
      {JOB_STAGE_LABEL[stage]}
    </span>
  );
}

function EmailRow({
  e,
  onMove,
  onUndo,
  onReview,
  busy,
}: {
  e: EmailView;
  onMove: () => void;
  onUndo: () => void;
  onReview: () => void;
  busy: boolean;
}) {
  const body = (
    <>
      <Avatar category={e.category} name={e.fromName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="w-40 shrink-0 truncate text-[14px] font-medium text-ink">{e.fromName}</p>
          <p className="min-w-0 flex-1 truncate text-[14px] text-ink-2">
            {e.subject} <span className="text-muted">— {e.snippet}</span>
          </p>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
          <span>{EMAIL_CATEGORY_LABEL[e.category]}</span>
          {e.jobStage && <StageTag stage={e.jobStage} />}
        </p>
      </div>
    </>
  );

  return (
    <li className="flex h-[60px] shrink-0 items-center gap-3 rounded-xl border border-line px-3">
      {e.gmailUrl ? (
        <a
          href={e.gmailUrl}
          target="_blank"
          rel="noreferrer"
          title="Open in Gmail"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
        >
          {body}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {e.finance?.status === "recorded" && (
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-2">
          <span className="tabular">
            {e.finance.kind === "trade" ? "Lots updated" : `${formatIDR(e.finance.amount)}${e.finance.walletLabel ? ` → ${e.finance.walletLabel}` : ""}`}
          </span>
          <button type="button" onClick={onUndo} disabled={busy} className="rounded px-1 font-medium text-ink underline-offset-2 hover:underline disabled:opacity-50">
            Undo
          </button>
        </span>
      )}
      {e.finance?.status === "review" && (
        <button
          type="button"
          onClick={onReview}
          className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[12px] font-medium text-ink hover:bg-accent/20"
        >
          Review
        </button>
      )}
      <time className="shrink-0 text-[12px] text-muted tabular" title={e.ago}>
        {e.timeLabel}
      </time>
      <IconButton label="Move to…" onClick={onMove} className="size-7">
        <FolderInput className="size-3.5" />
      </IconButton>
    </li>
  );
}

function ReviewRow({ r, onReview, onIgnore, busy }: { r: ReviewItem; onReview: () => void; onIgnore: () => void; busy: boolean }) {
  return (
    <li className="flex h-[60px] shrink-0 items-center gap-3 rounded-xl border border-line px-3">
      <Avatar category="finance" name={r.sourceLabel} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">
          {r.title} <span className="font-normal text-ink-2 tabular">· {formatIDR(r.amount)}</span>
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted">
          {r.sourceLabel} · {r.reason} · {r.ago}
        </p>
      </div>
      <Button variant="ghost" className="h-8 px-2.5 text-[13px]" onClick={onIgnore} disabled={busy}>
        Ignore
      </Button>
      <Button className="h-8 px-3 text-[13px]" onClick={onReview}>
        Review
      </Button>
    </li>
  );
}

/* ------------------------------------------------------------------ Move to… */

function MoveDialog({ email, onClose }: { email: EmailView | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(email)} onOpenChange={(o) => !o && onClose()} title="Move to…" size="sm" description={email?.fromAddress}>
      {email && <MoveForm key={email.id} email={email} onDone={onClose} />}
    </Modal>
  );
}

function MoveForm({ email, onDone }: { email: EmailView; onDone: () => void }) {
  const [category, setCategory] = useState<EmailCategory>(email.category);
  const [scope, setScope] = useState<"once" | "sender" | "domain">("once");
  const move = useAction(moveEmail, onDone);
  const domain = email.fromAddress.slice(email.fromAddress.lastIndexOf("@") + 1);
  const explain = {
    once: "Only this email. Fleur won't change it again.",
    sender: `Always put emails from ${email.fromAddress} in ${EMAIL_CATEGORY_LABEL[category]}, past ones too.`,
    domain: `Always put emails from anyone @${domain} in ${EMAIL_CATEGORY_LABEL[category]}, past ones too.`,
  }[scope];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Category">
        {EMAIL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-lg border px-2 py-2 text-[13px] transition",
              category === c ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:bg-soft",
            )}
          >
            {EMAIL_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <Segmented
        name="scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: "once", label: "This email" },
          { value: "sender", label: "Sender" },
          { value: "domain", label: `@${domain.length > 14 ? "domain" : domain}` },
        ]}
      />
      <p className="text-[13px] text-muted">{explain}</p>
      <FormError error={move.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={move.pending} onClick={() => move.run({ id: email.id, category, scope })}>
          {move.pending ? "Saving…" : "Move"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Review */

function ReviewDialog({
  item,
  onClose,
  categories,
  wallets,
}: {
  item: ReviewItem | null;
  onClose: () => void;
  categories: Category[];
  wallets: WalletLite[];
}) {
  const trade = useAction(applyTrade, onClose);
  const ignore = useAction(ignoreReview, onClose);
  if (!item) return null;
  const description = `${item.reason} · ${item.fromName}: “${item.subject}”`;

  if (item.suggest.mode === "trade" && item.stock) {
    const s = item.stock;
    return (
      <Modal open onOpenChange={(o) => !o && onClose()} title="Stock trade from Ajaib" size="sm" description={description}>
        <div className="grid gap-4">
          <p className="text-[14px] text-ink-2">
            {s.side === "buy" ? "Bought" : "Sold"} <strong className="text-ink">{plural(s.lots, "lot", "lot")}</strong> {s.symbol}
            {s.price ? ` at ${formatIDR(s.price)}` : ""}. {s.side === "buy" ? "Add" : "Remove"} {plural(s.lots, "lot", "lot")}{" "}
            {s.side === "buy" ? "to" : "from"} your {s.symbol} stock (Money → Wallets → Stocks)?
          </p>
          <FormError error={trade.error ?? ignore.error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => ignore.run(item.emailId)} disabled={ignore.pending}>
              Ignore
            </Button>
            <Button onClick={() => trade.run(item.emailId)} disabled={trade.pending}>
              {trade.pending ? "Saving…" : "Update lots"}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const mode = item.suggest.mode === "trade" ? "expense" : item.suggest.mode;
  return (
    <ReviewTransactionDialog
      key={item.emailId}
      open
      onOpenChange={(o) => !o && onClose()}
      categories={categories}
      wallets={wallets}
      mode={mode}
      walletId={item.suggest.walletId}
      initial={{
        amount: item.amount,
        title: item.title,
        date: item.dateInput,
        categoryId: item.suggest.categoryId,
        fromWalletId: item.suggest.fromWalletId,
        toWalletId: item.suggest.toWalletId,
      }}
      email={{ id: item.emailId, rememberLabel: item.suggest.rememberLabel }}
      description={description}
    />
  );
}

/* ------------------------------------------------------------------ Rules */

function RulesDialog({ open, onOpenChange, settings }: { open: boolean; onOpenChange: (o: boolean) => void; settings: EmailSettings }) {
  const del = useAction(deleteRule);
  const forget = useAction(forgetWalletLink);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Email rules" description="How Fleur sorts your mail and where bank emails are recorded.">
      <div className="grid gap-5">
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-ink">Sender rules</h3>
          {settings.rules.length ? (
            <ul className="grid gap-1.5">
              {settings.rules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-ink">{r.kind === "domain" ? `@${r.pattern}` : r.pattern}</span>
                  <span className="shrink-0 text-muted">→ {EMAIL_CATEGORY_LABEL[r.category]}</span>
                  <IconButton label={`Delete rule for ${r.pattern}`} className="size-7" onClick={() => del.run(r.id)} disabled={del.pending}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-soft px-3 py-2 text-[13px] text-ink-2">
              No rules yet. Use <FolderInput className="inline size-3.5 align-[-2px]" /> Move to… on an email and pick Sender or
              @domain, e.g. to mark your company&apos;s domain as Work.
            </p>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-ink">Bank wallets</h3>
          <ul className="grid gap-1.5">
            {settings.wallets.map((w) => (
              <li key={w.source} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                <span className="w-16 shrink-0 font-medium text-ink">{w.label}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">
                  {w.walletName ? (
                    <>
                      → {w.walletName}
                      {!w.linked && <span className="text-muted"> (matched by name)</span>}
                    </>
                  ) : (
                    <span className="text-muted">Not set: you&apos;ll pick it on the next email</span>
                  )}
                </span>
                {w.linked && (
                  <Button variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => forget.run(w.source)} disabled={forget.pending}>
                    Forget
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <FormError error={del.error ?? forget.error} />
      </div>
    </Modal>
  );
}
