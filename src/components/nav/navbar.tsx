"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MailWarning } from "lucide-react";
import { endDemo } from "@/app/actions/demo";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/money", label: "Money" },
  { href: "/email", label: "Email" },
  { href: "/notes", label: "Notes" },
  { href: "/workout", label: "Workout" },
];

/**
 * The Fleur flower (lucide's Flower2, drawn inline so its parts can be coloured).
 * On the Overview the petals are rose red and the stem and leaves green; elsewhere
 * it's all white.
 */
function FleurMark({ bloom }: { bloom: boolean }) {
  const petal = bloom ? "stroke-[#e11d48]" : "stroke-current";
  const stem = bloom ? "stroke-[#22c55e]" : "stroke-current";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-[18px] [&_*]:transition-[stroke] [&_*]:duration-300"
    >
      <g className={stem}>
        <path d="M12 10v12" />
        <path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z" />
        <path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z" />
      </g>
      <g className={petal}>
        <path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1" />
        <circle cx="12" cy="8" r="2" />
      </g>
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Navbar({
  greeting,
  dateLabel,
  gmailConnected,
  user,
  demoEndsLabel,
}: {
  greeting: string;
  dateLabel: string;
  gmailConnected: boolean;
  user: { name: string; email: string };
  /** "15:42" when this is a "Try the demo" sandbox (it is deleted then). */
  demoEndsLabel: string | null;
}) {
  const pathname = usePathname();
  const onAccount = pathname.startsWith("/account");

  return (
    <nav aria-label="Main" className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 py-4">
      <Link
        href="/"
        aria-label="Overview"
        title="Overview"
        className={cn(
          "flex items-center gap-2.5 rounded-xl pr-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <span
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-xl text-white shadow-card transition",
            "bg-ink", pathname !== "/" && "hover:bg-ink-2",
          )}
        >
          <FleurMark bloom={pathname === "/"} />
        </span>
        <span className="text-[17px] font-semibold tracking-tight">Fleur</span>
      </Link>

      <ul className="flex items-center gap-1 rounded-xl bg-card p-1 shadow-card">
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-3.5 py-1.5 text-[14px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-4",
                  active ? "bg-ink text-white" : "text-ink-2 hover:bg-soft hover:text-ink",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="ml-auto flex items-center gap-4">
        {demoEndsLabel && (
          <form action={endDemo} className="flex items-center gap-1 rounded-full bg-card py-1 pl-3 pr-1 text-[12.5px] shadow-card">
            <span className="text-ink-2">
              <span className="font-semibold text-ink">Demo</span> · ends {demoEndsLabel}
            </span>
            <button
              type="submit"
              className="rounded-full bg-ink px-2.5 py-1 font-medium text-white transition hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Exit demo
            </button>
          </form>
        )}
        <div className="hidden items-center gap-4 md:flex">
        {!gmailConnected && !demoEndsLabel && (
          <Link href="/email" className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink" title="Link Gmail on the Email page">
            <MailWarning className="size-4" /> Gmail not connected
          </Link>
        )}
        <div className="text-right leading-tight">
          <p className="text-[14px] font-medium text-ink">{greeting}</p>
          <p className="text-[12px] text-muted">{dateLabel}</p>
        </div>
        </div>
        <Link
          href="/account"
          aria-label={`Account: ${user.name}`}
          title={`${user.name} · ${user.email}`}
          aria-current={onAccount ? "page" : undefined}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold shadow-card transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            onAccount ? "bg-ink text-white" : "bg-card text-ink hover:bg-soft",
          )}
        >
          {initials(user.name)}
        </Link>
      </div>
    </nav>
  );
}
