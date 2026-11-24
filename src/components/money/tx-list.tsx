"use client";

import { Mail, MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { deleteTransaction } from "@/app/actions/transactions";
import { cn } from "@/lib/cn";
import { formatIDR } from "@/lib/format";
import type { TxView } from "@/lib/queries/finance";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Pager } from "@/components/ui/pager";
import { EmptyState } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { useFitCount, usePaged } from "@/components/ui/use-fit";

/** "latest" keeps the newest-first order from the server; asc/desc sort by amount. */
export type TxSort = "latest" | "asc" | "desc";

const GAP = 8;

export function TxRow({
  tx,
  showDate = false,
  compact = false,
  showWallet = true,
}: {
  tx: TxView;
  showDate?: boolean;
  compact?: boolean;
  showWallet?: boolean;
}) {
  const remove = useAction(deleteTransaction);
  const del = (
    <button
      type="button"
      aria-label={`Delete ${tx.title}`}
      title="Delete"
      className="rounded p-0.5 text-faint transition hover:bg-soft hover:text-down focus-visible:outline-2 focus-visible:outline-accent"
      onClick={() => {
        if (confirm(`Delete "${tx.title}" (${formatIDR(tx.amount)})?`)) remove.run(tx.id);
      }}
    >
      <MoreHorizontal className="size-4" />
    </button>
  );
  const amount = (
    <p className={cn("text-[14px] font-semibold tabular", tx.type === "income" && "text-up")}>
      {tx.type === "income" ? "+" : ""}
      {formatIDR(tx.amount)}
    </p>
  );

  return (
    <li
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-xl border border-line px-3 transition",
        compact ? "h-[52px]" : "h-[60px]",
        remove.pending && "opacity-40",
      )}
    >
      <CategoryIcon name={tx.icon} className={compact ? "size-8 [&>svg]:size-4" : "size-9"} />
      <div className="min-w-0 flex-1">
        <p className={cn("flex items-center gap-1.5 leading-snug text-ink", compact ? "text-[14px]" : "text-[15px]")}>
          <span className="truncate">{tx.title}</span>
          {tx.source === "email" && (
            <span title="Recorded from email" className="inline-flex shrink-0 items-center rounded bg-soft px-1 py-0.5 text-muted">
              <Mail className="size-3" />
            </span>
          )}
        </p>
        <p className={cn("truncate text-muted", compact ? "text-[12px]" : "text-[13px]")}>
          {tx.categoryName} · {showWallet && <span className="text-ink-2">{tx.walletName} · </span>}
          {showDate ? (
            <span title={tx.ago}>{tx.dateLabel}</span>
          ) : (
            <span className="text-down" title={tx.dateLabel}>
              {tx.ago}
            </span>
          )}
        </p>
      </div>
      {compact ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {amount}
          {del}
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-end [&>button]:-mr-1">
          {del}
          {amount}
        </div>
      )}
    </li>
  );
}

/** Paged, sortable list whose page size is however many rows fit — used on the Money page. */
export function PagedTxList({
  items,
  sort = "latest",
  showWallet = true,
  empty,
  noun,
}: {
  items: TxView[];
  sort?: TxSort;
  showWallet?: boolean;
  empty: string;
  noun: string;
}) {
  const sorted = useMemo(() => {
    if (sort === "latest") return items;
    const dir = sort === "asc" ? 1 : -1;
    return [...items].sort((a, b) => dir * (a.amount - b.amount) || b.dateISO.localeCompare(a.dateISO));
  }, [items, sort]);
  const [ref, count] = useFitCount<HTMLUListElement>(52, GAP, 8);
  const p = usePaged(sorted, count);
  return (
    <>
      <ul ref={ref} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {items.length ? (
          p.pageItems.map((t) => <TxRow key={t.id} tx={t} showDate compact showWallet={showWallet} />)
        ) : (
          <EmptyState>{empty}</EmptyState>
        )}
      </ul>
      <Pager {...p} noun={noun} />
    </>
  );
}
