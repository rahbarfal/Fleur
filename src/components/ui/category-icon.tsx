import {
  Briefcase,
  Car,
  Circle,
  Dumbbell,
  Film,
  Footprints,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  type LucideIcon,
  PersonStanding,
  PiggyBank,
  Plane,
  Receipt,
  Scale,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  "shopping-cart": ShoppingCart,
  receipt: Receipt,
  "shopping-bag": ShoppingBag,
  film: Film,
  "heart-pulse": HeartPulse,
  briefcase: Briefcase,
  laptop: Laptop,
  wallet: Wallet,
  home: House,
  "graduation-cap": GraduationCap,
  plane: Plane,
  gift: Gift,
  smartphone: Smartphone,
  "piggy-bank": PiggyBank,
  "trending-up": TrendingUp,
  circle: Circle,
  scale: Scale,
  strength: Dumbbell,
  cardio: Footprints,
  mobility: PersonStanding,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Circle;
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-soft text-ink-2",
        className,
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </span>
  );
}
