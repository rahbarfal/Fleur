"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { WEEKDAYS_SHORT } from "@/lib/dates";
import { formatIDR, formatIDRShort } from "@/lib/format";
import type { CashDay, TxView } from "@/lib/queries/finance";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/primitives";
import { TxRow } from "./tx-list";

const tone = (net: number) => (net > 0 ? "text-up" : net < 0 ? "text-down" : "text-muted");

function DayDetails({ day }: { day: CashDay }) {
  return (
    <div className="w-60 rounded-xl border border-line bg-card p-3.5 shadow-pop">
      <p className="mb-2.5 text-[13px] font-semibold text-ink">{day.label}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px] tabular">
        <dt className="text-ink-2">Income</dt>
        <dd className="text-right font-medium text-up">+{formatIDR(day.income)}</dd>
        <dt className="text-ink-2">Spending</dt>
        <dd className="text-right font-medium text-down">-{formatIDR(day.expense)}</dd>
        <dt className="border-t border-line pt-1.5 font-medium text-ink">Net</dt>
        <dd className={cn("border-t border-line pt-1.5 text-right font-semibold", tone(day.net))}>
          {day.net > 0 ? "+" : ""}
          {formatIDR(day.net)}
        </dd>
      </dl>
      <p className="mt-2.5 text-[11px] text-muted">Click to see the transactions</p>
    </div>
  );
}

function DaySection({
  icon,
  title,
  total,
  items,
  empty,
}: {
  icon: ReactNode;
  title: string;
  total: ReactNode;
  items: TxView[];
  empty: string;
}) {
  return (
    <section>
      <header className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink [&>svg]:size-4">
          {icon}
          {title}
          <span className="font-normal text-muted">· {items.length}</span>
        </h3>
        <span className="text-[13px] font-semibold tabular">{total}</span>
      </header>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((t) => (
            <TxRow key={t.id} tx={t} compact />
          ))}
        </ul>
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
    </section>
  );
}

/** One day's income and spending lists. */
function DayModal({ day, onClose }: { day: CashDay | null; onClose: () => void }) {
  const income = day?.transactions.filter((t) => t.type === "income") ?? [];
  const expense = day?.transactions.filter((t) => t.type === "expense") ?? [];
  return (
    <Modal
      open={Boolean(day)}
      onOpenChange={(open) => !open && onClose()}
      title={day?.label ?? ""}
      description={
        day && (
          <span className="tabular">
            Net{" "}
            <span className={cn("font-semibold", tone(day.net))}>
              {day.net > 0 ? "+" : ""}
              {formatIDR(day.net)}
            </span>
          </span>
        )
      }
    >
      {day && (
        <div className="flex flex-col gap-5">
          <DaySection
            icon={<ArrowDownLeft className="text-up" />}
            title="Income"
            total={<span className="text-up">+{formatIDR(day.income)}</span>}
            items={income}
            empty="No income this day"
          />
          <DaySection
            icon={<ArrowUpRight className="text-down" />}
            title="Spending"
            total={<span className="text-down">-{formatIDR(day.expense)}</span>}
            items={expense}
            empty="No spending this day"
          />
        </div>
      )}
    </Modal>
  );
}

/**
 * A month of daily gain/loss: green +Rp234K, red -Rp500K. Hover (or focus) a day for its
 * income and spending; click it for that day's transactions. `compact` is for short cards.
 */
export function CashCalendar({ days, compact = false }: { days: CashDay[]; compact?: boolean }) {
  const weeks = days.length / 7;
  // Keyed by date so the modal shows fresh data after a delete re-renders the page.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openDay = days.find((d) => d.key === openKey && d.hasActivity) ?? null;
  return (
    <>
      <div
        className={cn("grid grid-cols-7 fit:h-full", compact ? "h-[240px] gap-1 short:gap-0.5" : "h-[360px] gap-1.5 short:gap-1")}
        style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(16px, 1fr))` }}
      >
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d} className={cn("text-center text-muted", compact ? "text-[11px] leading-none" : "pb-0.5 text-[12px]")}>
            {compact ? d.slice(0, 2) : d}
          </span>
        ))}
        {days.map((day) => {
          const shown = day.inMonth && !day.future;
          const Cell = day.hasActivity ? "button" : "div";
          const cell = (
            <Cell
              {...(day.hasActivity && {
                type: "button" as const,
                onClick: () => setOpenKey(day.key),
              })}
              aria-label={
                day.hasActivity
                  ? `${day.label}: income ${formatIDR(day.income)}, spending ${formatIDR(day.expense)}, net ${formatIDR(day.net)}`
                  : undefined
              }
              className={cn(
                // Date in the corner, net on the right, vertically centred: readable even in short cells.
                "@container relative flex min-w-0 items-center text-left justify-end overflow-hidden border outline-none transition",
                compact ? "rounded-md px-1" : "rounded-lg px-1.5",
                !day.inMonth && "border-transparent",
                day.inMonth && "border-line bg-card",
                day.future && "opacity-50",
                shown && day.hasActivity && day.net > 0 && "border-up/20 bg-up-soft",
                shown && day.hasActivity && day.net < 0 && "border-down/20 bg-down-soft",
                day.hasActivity && "cursor-pointer hover:border-faint focus-visible:border-accent",
                day.isToday && "ring-2 ring-accent/30",
              )}
            >
              <span
                className={cn(
                  "absolute leading-none tabular",
                  compact ? "left-1 top-0.5 text-[10px]" : "left-1.5 top-1 text-[11px]",
                  day.inMonth ? "text-ink-2" : "text-faint/60",
                  day.isToday && "font-semibold text-accent",
                )}
              >
                {day.day}
              </span>
              {shown && day.hasActivity && (
                <span
                  className={cn(
                    "whitespace-nowrap font-semibold leading-none tabular text-[10px] @min-[64px]:text-[11px] @min-[88px]:text-[12px]",
                    tone(day.net),
                  )}
                >
                  {/* Narrow cells drop the "Rp" so the number always fits: +234K */}
                  <span className="hidden @min-[60px]:inline">{formatIDRShort(day.net)}</span>
                  <span className="@min-[60px]:hidden">{formatIDRShort(day.net).replace("Rp", "")}</span>
                </span>
              )}
            </Cell>
          );
          if (!day.hasActivity)
            return (
              <div key={day.key} className="flex min-h-0 flex-col [&>*]:flex-1">
                {cell}
              </div>
            );
          return (
            <HoverCard.Root key={day.key} openDelay={80} closeDelay={60}>
              <HoverCard.Trigger asChild>
                <div className="flex min-h-0 flex-col [&>*]:flex-1">{cell}</div>
              </HoverCard.Trigger>
              <HoverCard.Portal>
                <HoverCard.Content
                  side="top"
                  align="center"
                  sideOffset={6}
                  collisionPadding={12}
                  className="z-50 data-[state=open]:animate-fade-in"
                >
                  <DayDetails day={day} />
                </HoverCard.Content>
              </HoverCard.Portal>
            </HoverCard.Root>
          );
        })}
      </div>
      <DayModal day={openDay} onClose={() => setOpenKey(null)} />
    </>
  );
}
