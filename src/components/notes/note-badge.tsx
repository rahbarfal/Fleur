"use client";

import {
  BookOpen,
  Bookmark,
  Briefcase,
  Calendar,
  Camera,
  Code,
  Dumbbell,
  FileText,
  Flag,
  Gift,
  GraduationCap,
  Heart,
  House,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  Music,
  PiggyBank,
  Plane,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  Utensils,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { NOTE_ICONS, type NoteIcon } from "@/lib/constants";

export const NOTE_ICON_COMPONENTS: Record<NoteIcon, LucideIcon> = {
  "file-text": FileText,
  lightbulb: Lightbulb,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  briefcase: Briefcase,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  dumbbell: Dumbbell,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  plane: Plane,
  house: House,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  calendar: Calendar,
  "list-checks": ListChecks,
  target: Target,
  music: Music,
  camera: Camera,
  code: Code,
  gift: Gift,
  flag: Flag,
  sparkles: Sparkles,
};

export const noteIconLabel = (icon: NoteIcon) => icon.replace(/-/g, " ");

/** First letter of the title (or "U" for Untitled), used when a note has no logo. */
export function noteInitial(title: string): string {
  const ch = [...(title.trim() || "Untitled")][0] ?? "U";
  return ch.toUpperCase();
}

/** Square tile with the note's logo, or the first letter of its title. */
export function NoteBadge({
  icon,
  title,
  active = false,
  className,
}: {
  icon: NoteIcon | null;
  title: string;
  active?: boolean;
  className?: string;
}) {
  const Icon = icon ? NOTE_ICON_COMPONENTS[icon] : null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border text-[14px] font-semibold",
        active ? "border-ink bg-ink text-white" : "border-line bg-soft text-ink-2",
        className,
      )}
    >
      {Icon ? <Icon className="size-[18px]" strokeWidth={1.75} /> : noteInitial(title)}
    </span>
  );
}

/** Grid of logos plus "No logo". */
export function NoteIconGrid({ value, onPick }: { value: NoteIcon | null; onPick: (icon: NoteIcon | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Note logo" className="grid grid-cols-6 gap-1.5">
      {NOTE_ICONS.map((name) => {
        const Icon = NOTE_ICON_COMPONENTS[name];
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value === name}
            aria-label={noteIconLabel(name)}
            title={noteIconLabel(name)}
            onClick={() => onPick(name)}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-lg border transition focus-visible:outline-2 focus-visible:outline-accent",
              value === name ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:bg-soft",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={1.75} />
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => onPick(null)}
        className={cn(
          "col-span-6 h-8 rounded-lg border text-[13px] transition focus-visible:outline-2 focus-visible:outline-accent",
          value === null ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:bg-soft",
        )}
      >
        No logo (use the first letter)
      </button>
    </div>
  );
}
