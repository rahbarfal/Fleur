import { Banknote, CandlestickChart, Landmark, Smartphone, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { WalletType } from "@/lib/constants";
import { cn } from "@/lib/cn";

export const WALLET_ICON: Record<WalletType, LucideIcon> = {
  bank: Landmark,
  ewallet: Smartphone,
  cash: Banknote,
  investment: TrendingUp,
  other: Wallet,
};

export function WalletIcon({ type, active = false, className }: { type: WalletType; active?: boolean; className?: string }) {
  const Icon = WALLET_ICON[type];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition",
        active ? "bg-ink text-white" : "border border-line bg-soft text-ink-2",
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.8} />
    </span>
  );
}

/** Round icon for a stock holding (same look as a wallet icon). */
export function StockIcon({ active = false, className }: { active?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition",
        active ? "bg-ink text-white" : "border border-line bg-soft text-ink-2",
        className,
      )}
    >
      <CandlestickChart className="size-4" strokeWidth={1.8} />
    </span>
  );
}

/** Greys for allocation segments, darkest first (monochrome like the rest of the UI). */
export const SHADES = ["#232325", "#55565b", "#8e8f93", "#b8b9bc", "#d4d5d8", "#e6e7e9"];
