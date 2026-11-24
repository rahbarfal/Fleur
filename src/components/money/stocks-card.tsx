"use client";

import { CandlestickChart, Check, Pencil, Plus, TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";
import { addWatchStock, removeWatchStock } from "@/app/actions/stocks";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { formatCompact, formatIDR, formatNumber, formatPct } from "@/lib/format";
import type { StockQuote, StockRange, WatchQuote } from "@/lib/queries/stocks";
import { CardShell } from "@/components/dashboard/card-shell";
import { Modal } from "@/components/ui/modal";
import { Button, EmptyState, Field, FormError, IconButton, Input, PillSelect, TrendBadge } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { useSearchParamSetter } from "@/components/ui/use-search-param";

const RANGE_LABEL: Record<StockRange, string> = { "1mo": "1M", "3mo": "3M", "6mo": "6M", "1y": "1Y" };

type Point = { label: string; close: number };

function PriceTip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg bg-[#232325] px-2.5 py-1.5 text-[12px] text-white shadow-pop">
      <p className="text-white/60">{p.label}</p>
      <p className="font-medium tabular">{formatIDR(p.close)}</p>
    </div>
  );
}

function Sparkline({ points, up, fill }: { points: Point[]; up: boolean; fill: boolean }) {
  const id = useId().replace(/:/g, "");
  const color = up ? "#3b82f6" : "#9ca3af";
  return (
    <div className={cn("h-16 w-full", fill && "fit:h-full fit:min-h-[28px]")}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip content={<PriceTip />} cursor={{ stroke: "#d4d5d8", strokeDasharray: "3 4" }} isAnimationActive={false} />
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#sp-${id})`}
            dot={false}
            activeDot={{ r: 3.5, fill: color, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StockBlock({ q, range, dark, fill }: { q: StockQuote; range: StockRange; dark: boolean; fill: boolean }) {
  const avatar = (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide",
        dark ? "bg-ink text-white" : "border border-line bg-soft text-ink",
      )}
      aria-hidden
    >
      {q.symbol.length >= 4 ? q.symbol.slice(1) : q.symbol}
    </span>
  );

  if (!q.ok) {
    return (
      <div className={cn("flex items-center gap-3 py-2", fill && "fit:flex-1")}>
        {avatar}
        <div className="min-w-0">
          <p className="text-[15px] font-medium">{q.symbol}</p>
          <p className="flex items-center gap-1.5 text-[13px] text-down">
            <TriangleAlert className="size-3.5" /> Couldn&apos;t load price ({q.error})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", fill && "fit:min-h-0 fit:flex-1")}>
      <div className="flex shrink-0 items-center gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight text-ink">{q.symbol}</p>
          <p className="truncate text-[12px] text-muted" title={`${q.name} · IDX`}>
            {q.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[17px] font-semibold leading-tight tabular">{formatIDR(q.price)}</p>
          <p className={cn("text-[12px] tabular", q.dayChange >= 0 ? "text-up" : "text-down")}>
            {q.dayChange >= 0 ? "+" : ""}
            {formatNumber(q.dayChange)} ({formatPct(q.dayChangePct)}) today
          </p>
        </div>
      </div>
      <div className={cn("mt-2", fill && "fit:min-h-0 fit:flex-1")}>
        <Sparkline points={q.points} up={q.rangeChangePct >= 0} fill={fill} />
      </div>
      <div className="mt-2 flex shrink-0 items-center justify-between gap-2 text-[12px] text-muted">
        <span className="truncate tabular" title={`Volume ${formatCompact(q.volume)}`}>
          Day {formatNumber(q.dayLow)}–{formatNumber(q.dayHigh)}
          <span className="max-[1400px]:hidden"> · Vol {formatCompact(q.volume)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {RANGE_LABEL[range]}
          <TrendBadge value={q.rangeChangePct} className="px-1 py-0 text-[11px]" />
        </span>
      </div>
    </div>
  );
}

export function StocksCard({ quotes, range, className }: { quotes: WatchQuote[]; range: StockRange; className?: string }) {
  const { set, pending } = useSearchParamSetter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removed, setRemoved] = useState<number[]>([]);
  const remove = useAction(removeWatchStock);

  // A failed delete shows everything again (the server list is the truth).
  const shown = remove.error ? quotes : quotes.filter((q) => !removed.includes(q.watchId));
  // Up to 2 stocks share the card's height; more become a scrolling list.
  const list = shown.length > 2;
  const updated = shown.find((q) => q.ok);

  const pill = "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <CardShell
      icon={<CandlestickChart />}
      title="Stocks"
      className={className}
      actions={
        editing ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setAdding(true)} className={cn(pill, "border border-line bg-card text-ink hover:bg-soft")}>
              <Plus className="size-3.5" /> Add
            </button>
            <button
              type="button"
              onClick={() => setDeleting((d) => !d)}
              aria-pressed={deleting}
              disabled={!shown.length}
              className={cn(pill, "disabled:opacity-40", deleting ? "bg-down text-white" : "border border-line bg-card text-down hover:bg-down-soft")}
            >
              <X className="size-3.5" /> Delete
            </button>
            <IconButton
              label="Done editing"
              onClick={() => {
                setEditing(false);
                setDeleting(false);
              }}
              className="bg-ink text-white hover:bg-ink-2 hover:text-white"
            >
              <Check className="size-4" />
            </IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <PillSelect aria-label="Range" value={range} onChange={(e) => set("range", e.target.value)}>
              {Object.entries(RANGE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </PillSelect>
            <IconButton label="Edit stocks" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </IconButton>
          </div>
        )
      }
    >
      {deleting && <p className="-mt-1 mb-2 shrink-0 text-[12px] text-down">Click a stock to remove it.</p>}
      <FormError error={remove.error} />

      {!shown.length ? (
        <EmptyState>
          No stocks yet. Use <Pencil className="inline size-3.5 align-[-2px]" /> → Add to follow one.
        </EmptyState>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-3 transition-opacity fit:min-h-0 fit:flex-1",
            list && "scroll-quiet -mr-2 overflow-y-auto pr-2",
            pending && "opacity-50",
          )}
        >
          {shown.map((q, i) => (
            <div
              key={q.watchId}
              className={cn("relative flex shrink-0 flex-col", !list && "fit:min-h-0 fit:flex-1", i > 0 && "border-t border-line pt-3")}
            >
              <StockBlock q={q} range={range} dark={i === 0} fill={!list} />
              {deleting && (
                <button
                  type="button"
                  aria-label={`Remove ${q.symbol}`}
                  title={`Remove ${q.symbol}`}
                  onClick={() => {
                    setRemoved((r) => [...r, q.watchId]);
                    remove.run(q.watchId);
                  }}
                  className={cn(
                    "absolute inset-x-0 bottom-0 flex items-center justify-center rounded-xl bg-white/60 ring-2 ring-inset ring-down/40 transition hover:bg-down-soft/60 hover:ring-down",
                    i > 0 ? "top-2" : "top-0",
                  )}
                >
                  <span className="inline-flex items-center gap-1 rounded-full bg-down px-3 py-1 text-[12px] font-medium text-white shadow-card">
                    <X className="size-3.5" /> Remove {q.symbol}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!list && shown.length > 0 && (
        <p className="mt-2 shrink-0 text-[11px] text-faint">
          Yahoo Finance · delayed ~15 min{updated?.ok ? ` · last trade ${updated.updatedLabel}` : ""}
        </p>
      )}

      <AddStockDialog open={adding} onOpenChange={setAdding} />
    </CardShell>
  );
}

function AddStockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add a stock" description="Any stock on the Indonesia Stock Exchange (IDX)." size="sm">
      {open && <AddStockForm onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function AddStockForm({ onDone }: { onDone: () => void }) {
  const uid = useId();
  const add = useAction(addWatchStock, onDone);
  const [symbol, setSymbol] = useState("");
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.run(symbol);
      }}
    >
      <Field label="Stock code" htmlFor={`${uid}-symbol`} hint="The IDX code, e.g. TLKM, BMRI or GOTO.">
        <Input
          id={`${uid}-symbol`}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="TLKM"
          autoComplete="off"
          autoFocus
          required
          className="uppercase tracking-wide"
        />
      </Field>
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={add.pending || symbol.length < 2}>
          {add.pending ? "Checking…" : "Add stock"}
        </Button>
      </div>
    </form>
  );
}
