"use client";

import { cn } from "@/lib/cn";
import type { WorthMode } from "@/components/ui/use-stored-state";

/** "Net · Cash · Stocks": everything, wallets only, or stocks only. */
export function WorthToggle({
  value,
  onChange,
  tone = "light",
}: {
  value: WorthMode;
  onChange: (v: WorthMode) => void;
  tone?: "light" | "dark";
}) {
  const options: { value: WorthMode; label: string; title: string }[] = [
    { value: "net", label: "Net", title: "Net worth: wallets and stocks" },
    { value: "cash", label: "Cash", title: "Wallets only" },
    { value: "stocks", label: "Stocks", title: "Stocks only" },
  ];
  return (
    <div
      role="group"
      aria-label="Net worth"
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md p-0.5 text-[11px]",
        tone === "dark" ? "bg-white/10" : "border border-line bg-soft",
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            "h-full rounded px-2 font-medium transition focus-visible:outline-2 focus-visible:outline-accent",
            tone === "dark"
              ? value === o.value
                ? "bg-white text-ink"
                : "text-white/70 hover:text-white"
              : value === o.value
                ? "bg-card text-ink shadow-sm"
                : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
