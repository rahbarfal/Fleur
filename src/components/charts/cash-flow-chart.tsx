"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIDR, formatIDRCompact } from "@/lib/format";

/** One point on the x axis: a month ("Jan") or a day ("14"). Null = no data yet (future). */
export type CashFlowPoint = { key: number; x: string; label: string; income: number | null; expense: number | null };

const ACCENT = "#3b82f6";
const GRAY = "#c9cacd";

type CursorProps = { points?: { x: number; y: number }[]; height?: number; width?: number };

/** The blue gradient pillar behind the hovered point. */
function HighlightCursor({ points, height = 0, width = 44 }: CursorProps & { width?: number }) {
  if (!points?.length) return null;
  const x = points[0].x;
  const top = points[0].y;
  const bottom = points[1]?.y ?? top + height;
  return (
    <rect
      x={x - width / 2}
      y={top}
      width={width}
      height={Math.max(0, bottom - top)}
      rx={Math.min(10, width / 2)}
      fill="url(#cf-cursor)"
    />
  );
}

type TipProps = {
  active?: boolean;
  payload?: { payload: CashFlowPoint }[];
  hint?: string;
};

function DarkTooltip({ active, payload, hint }: TipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p || p.income === null || p.expense === null) return null;
  const net = p.income - p.expense;
  return (
    <div className="min-w-48 rounded-xl bg-[#232325] px-4 py-3 text-[13px] text-white shadow-pop">
      <p className="mb-2 font-medium">{p.label}</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-1.5">
        <dt className="flex items-center gap-2 text-white/60">
          <span className="size-1.5 rounded-full" style={{ background: ACCENT }} /> Income
        </dt>
        <dd className="text-right tabular">{formatIDR(p.income)}</dd>
        <dt className="flex items-center gap-2 text-white/60">
          <span className="size-1.5 rounded-full bg-white/80" /> Expense
        </dt>
        <dd className="text-right tabular">{formatIDR(p.expense)}</dd>
        <dt className="text-white/60">Net</dt>
        <dd className={`text-right tabular ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatIDR(net)}</dd>
      </dl>
      {hint && <p className="mt-2 text-[12px] text-white/40">{hint}</p>}
    </div>
  );
}

/**
 * Income (blue line) vs expense (gray area). Fills its parent's height in the
 * fit layout. `dense` is for ~30 daily points: thinner pillar, smaller dots.
 */
export function CashFlowChart({
  data,
  selectedKey,
  onSelect,
  dense = false,
  hint,
  label,
}: {
  data: CashFlowPoint[];
  selectedKey?: number;
  onSelect?: (key: number) => void;
  dense?: boolean;
  hint?: string;
  /** Accessible name; defaults to monthly/daily. */
  label?: string;
}) {
  if (!data.length) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted fit:h-full">
        No data for this period yet.
      </div>
    );
  }
  const selected = data.find((d) => d.key === selectedKey);
  const pillar = dense ? 14 : 44;

  return (
    <div
      className={`h-[260px] w-full fit:h-full fit:min-h-[110px] short:min-h-[48px] ${onSelect ? "[&_.recharts-surface]:cursor-pointer" : ""}`}
      role="img"
      aria-label={label ?? (dense ? "Daily income and expense line chart" : "Monthly income and expense line chart")}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          onClick={(state) => {
            if (!onSelect || !state) return;
            const point = data.find((d) => d.x === state.activeLabel);
            if (point) onSelect(point.key);
          }}
        >
          <defs>
            <linearGradient id="cf-cursor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.04} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.42} />
            </linearGradient>
            <linearGradient id="cf-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4d5d8" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#d4d5d8" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={!dense} horizontal={dense} stroke="#e3e4e6" strokeDasharray="4 6" />
          {selected && <ReferenceLine x={selected.x} stroke={ACCENT} strokeOpacity={0.12} strokeWidth={pillar} />}
          <XAxis
            dataKey="x"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b7280", fontSize: dense ? 12 : 13 }}
            tickMargin={12}
            padding={{ left: dense ? 8 : 16, right: dense ? 8 : 16 }}
            interval={dense ? "preserveStartEnd" : 0}
            minTickGap={dense ? 6 : 0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={62}
            tick={{ fill: "#6b7280", fontSize: 13 }}
            tickFormatter={(v: number) => formatIDRCompact(v)}
            tickCount={4}
            interval="preserveStartEnd"
          />
          <Tooltip
            content={<DarkTooltip hint={hint} />}
            cursor={<HighlightCursor width={pillar} />}
            offset={24}
            wrapperStyle={{ outline: "none" }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="expense"
            name="Expense"
            stroke={GRAY}
            strokeWidth={1.5}
            fill="url(#cf-area)"
            dot={dense ? { r: 2.5, fill: "#fff", stroke: GRAY, strokeWidth: 1.25 } : { r: 4, fill: "#fff", stroke: GRAY, strokeWidth: 1.5 }}
            activeDot={{ r: dense ? 4 : 5, fill: "#fff", stroke: "#9ca3af", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            type={dense ? "monotone" : "linear"}
            dataKey="income"
            name="Income"
            stroke={ACCENT}
            strokeWidth={1.75}
            dot={dense ? { r: 2.5, fill: "#fff", stroke: ACCENT, strokeWidth: 1.25 } : { r: 3.5, fill: "#fff", stroke: ACCENT, strokeWidth: 1.5 }}
            activeDot={{ r: dense ? 4 : 4.5, fill: ACCENT, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
