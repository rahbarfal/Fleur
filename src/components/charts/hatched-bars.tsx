import { cn } from "@/lib/cn";

const FILLS = ["hatch-dark text-white", "hatch-mid text-ink", "hatch-light text-ink"];

export function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Up to three adjacent striped bars with a dashed y-grid (reference "Top 3 product").
 * Fills its parent's height in the fit layout.
 */
export function HatchedBars({ items, label }: { items: { label: string; value: number }[]; label: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const step = niceStep(max / 4);
  const top = step * Math.max(1, Math.ceil(max / step));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).reverse();
  // Gap between bars = 10% of one bar's width: n·w + (n−1)·0.1w = 100%.
  const n = Math.max(1, items.length);
  const gap = { columnGap: `${(10 / (n + 0.1 * (n - 1))).toFixed(4)}%` };

  return (
    <figure
      aria-label={label}
      className="grid h-[220px] grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-3 fit:h-full"
    >
      <div className="flex flex-col justify-between text-right text-[12px] leading-none text-muted tabular" aria-hidden>
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="relative my-[6px]">
        {ticks.map((t) => (
          <div
            key={t}
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-[#dcdde0]"
            style={{ bottom: `${(t / top) * 100}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end" style={gap}>
          {items.map((item, i) => (
            <div
              key={item.label}
              className={cn(
                "relative flex min-w-0 flex-1 items-end rounded-t-xl rounded-b-md px-3 pb-2 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.04)]",
                FILLS[i] ?? FILLS[2],
              )}
              style={{ height: `max(32px, ${(item.value / top) * 100}%)` }}
              title={`${item.label}: ${item.value}`}
            >
              <span className="text-lg leading-none tabular">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div />
      <div className="mt-2 flex" style={gap}>
        {items.map((item) => (
          <span key={item.label} className="min-w-0 flex-1 truncate text-center text-[13px] text-muted">
            {item.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
