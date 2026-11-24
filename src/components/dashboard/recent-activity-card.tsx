"use client";

import { History, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadActivity } from "@/app/actions/transactions";
import type { Category } from "@/db/schema";
import type { ActivityPage, TxView } from "@/lib/queries/finance";
import { TransactionDialog, type WalletLite } from "@/components/forms/finance-dialogs";
import { TxRow } from "@/components/money/tx-list";
import { EmptyState, IconButton, ToggleGroup } from "@/components/ui/primitives";
import { useStoredState } from "@/components/ui/use-stored-state";
import { CardShell, OpenLink } from "./card-shell";

type Tab = "outgoing" | "incoming";
const TABS = ["outgoing", "incoming"] as const;

type ListState = { items: TxView[]; hasMore: boolean; loading: boolean; error: string | null };
const fromPage = (p: ActivityPage): ListState => ({ items: p.items, hasMore: p.hasMore, loading: false, error: null });

/**
 * Expenses or income, newest first, in one scrolling list. It starts with 10 and
 * loads the next 10 only when you scroll to the last one, until there are no more.
 */
export function RecentActivityCard({
  outgoing,
  incoming,
  categories,
  wallets,
  className,
}: {
  outgoing: ActivityPage;
  incoming: ActivityPage;
  categories: Category[];
  wallets: WalletLite[];
  className?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useStoredState<Tab>("fleur.recent.tab", "outgoing", TABS);
  const type = tab === "outgoing" ? "expense" : "income";

  // Both lists keep what they've loaded; new data from the server (a transaction
  // added or deleted) starts them over from the fresh first 10.
  const [lists, setLists] = useState({ from: { outgoing, incoming }, outgoing: fromPage(outgoing), incoming: fromPage(incoming) });
  const current = lists.from.outgoing === outgoing && lists.from.incoming === incoming
    ? lists
    : { from: { outgoing, incoming }, outgoing: fromPage(outgoing), incoming: fromPage(incoming) };
  if (current !== lists) setLists(current);
  const list = current[tab];

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const busy = useRef<Record<Tab, boolean>>({ outgoing: false, incoming: false });

  const loadMore = useCallback(async () => {
    const which = tab;
    const l = current[which];
    const last = l.items[l.items.length - 1];
    if (!last || !l.hasMore || busy.current[which]) return;
    busy.current[which] = true;
    const from = current.from;
    const patch = (fn: (s: ListState) => ListState) =>
      // Ignore results for data the server has since replaced.
      setLists((s) => (s.from === from ? { ...s, [which]: fn(s[which]) } : s));
    patch((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await loadActivity(which === "outgoing" ? "expense" : "income", last.dateISO, last.id);
      patch((s) =>
        res.ok
          ? { items: [...s.items, ...res.items.filter((t) => !s.items.some((x) => x.id === t.id))], hasMore: res.hasMore, loading: false, error: null }
          : { ...s, loading: false, error: res.error },
      );
    } catch {
      patch((s) => ({ ...s, loading: false, error: "Couldn't load more." }));
    } finally {
      busy.current[which] = false;
    }
  }, [tab, current]);

  // Load the next 10 once the last row scrolls into view.
  useEffect(() => {
    const root = scrollRef.current;
    const el = sentinelRef.current;
    if (!root || !el || !list.hasMore || list.error) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { root });
    io.observe(el);
    return () => io.disconnect();
  }, [list.hasMore, list.error, list.items.length, loadMore]);

  // A different tab, or fresh data (e.g. you just added one), starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab, current.from]);

  return (
    <CardShell
      icon={<History />}
      title="Recent Activity"
      className={className}
      actions={
        <>
          <IconButton label="Add transaction" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
          </IconButton>
          <OpenLink href="/money" label="All transactions" />
        </>
      }
    >
      <div className="mb-3 shrink-0">
        <ToggleGroup
          label="Show"
          value={tab}
          onChange={setTab}
          className="flex w-full"
          buttonClassName="flex-1"
          options={[
            { value: "outgoing", label: "Outgoing" },
            { value: "incoming", label: "Incoming" },
          ]}
        />
      </div>

      <div ref={scrollRef} className="scroll-quiet -mr-2 h-[360px] overflow-y-auto pr-2 fit:h-auto fit:min-h-0 fit:flex-1" aria-label={`${tab} transactions`}>
        {list.items.length ? (
          <ul className="flex flex-col gap-2">
            {list.items.map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </ul>
        ) : (
          <EmptyState>{type === "expense" ? "No expenses yet." : "No income yet."}</EmptyState>
        )}
        {/* Reaching this (just after the last row) loads the next 10. */}
        <div ref={sentinelRef} className="h-px" aria-hidden />
        {list.items.length > 0 && (
          <p className="flex h-9 items-center justify-center gap-1.5 text-[12px] text-muted">
            {list.loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Loading more…
              </>
            ) : list.error ? (
              <>
                {list.error}{" "}
                <button type="button" onClick={() => void loadMore()} className="font-medium text-ink underline-offset-2 hover:underline">
                  Try again
                </button>
              </>
            ) : list.hasMore ? (
              "Scroll for more"
            ) : (
              `That's everything · ${list.items.length} ${type === "expense" ? "expense" : "income"}${list.items.length === 1 || type === "income" ? "" : "s"}`
            )}
          </p>
        )}
      </div>

      <TransactionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        wallets={wallets}
        defaultType={type}
      />
    </CardShell>
  );
}
