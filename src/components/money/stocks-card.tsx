"use client";

import { CandlestickChart, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { formatCompact, formatIDR, formatNumber, formatPct } from "@/lib/format";
import type { StockQuote, StockRange } from "@/lib/queries/stocks";
import { CardShell } from "@/components/dashboard/card-shell";
import { PillSelect, TrendBadge } from "@/components/ui/primitives";
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

function Sparkline({ points, up }: { points: Point[]; up: boolean }) {
  const id = useId().replace(/:/g, "");
  const color = up ? "#3b82f6" : "#9ca3af";
  return (
    <div className="h-16 w-full fit:h-full fit:min-h-[28px]">
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

function StockBlock({ q, range, dark }: { q: StockQuote; range: StockRange; dark: boolean }) {
  const avatar = (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide",
        dark ? "bg-ink text-white" : "border border-line bg-soft text-ink",
      )}
      aria-hidden
    >
      {q.symbol.slice(1)}
    </span>
  );

  if (!q.ok) {
    return (
      <div className="flex items-center gap-3 py-2 fit:flex-1">
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
    <div className="flex flex-col fit:min-h-0 fit:flex-1">
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
      <div className="mt-2 fit:min-h-0 fit:flex-1">
        <Sparkline points={q.points} up={q.rangeChangePct >= 0} />
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

export function StocksCard({ quotes, range, className }: { quotes: StockQuote[]; range: StockRange; className?: string }) {
  const { set, pending } = useSearchParamSetter();
  const updated = quotes.find((q) => q.ok);

  return (
    <CardShell
      icon={<CandlestickChart />}
      title="Stocks"
      className={className}
      actions={
        <PillSelect aria-label="Range" value={range} onChange={(e) => set("range", e.target.value)}>
          {Object.entries(RANGE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </PillSelect>
      }
    >
      <div className={cn("flex flex-col gap-3 transition-opacity fit:min-h-0 fit:flex-1", pending && "opacity-50")}>
        {quotes.map((q, i) => (
          <div key={q.symbol} className={cn("flex flex-col fit:min-h-0 fit:flex-1", i > 0 && "border-t border-line pt-3")}>
            <StockBlock q={q} range={range} dark={i === 0} />
          </div>
        ))}
      </div>
      <p className="mt-2 shrink-0 text-[11px] text-faint">
        Yahoo Finance · delayed ~15 min{updated?.ok ? ` · last trade ${updated.updatedLabel}` : ""}
      </p>
    </CardShell>
  );
}
