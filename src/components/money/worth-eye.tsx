"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatIDR } from "@/lib/format";
import { useWorthHidden } from "@/components/ui/use-stored-state";

/** A net worth amount that turns into "Rp ••••••" when hidden. */
export function WorthAmount({ value }: { value: number }) {
  const [hidden] = useWorthHidden();
  return hidden ? <span aria-label="Hidden amount">Rp ••••••</span> : <>{formatIDR(value)}</>;
}

/** Eye button that shows/hides every net worth number at once. */
export function WorthEye({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const [hidden, setHidden] = useWorthHidden();
  const label = hidden ? "Show net worth" : "Hide net worth";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={hidden}
      onClick={() => setHidden(!hidden)}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-accent",
        tone === "dark" ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-soft hover:text-ink",
        className,
      )}
    >
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
