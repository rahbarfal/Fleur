import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * White rounded card with the reference's header: icon · UPPERCASE TITLE · controls.
 * In the "fit" layout the card takes its grid cell's height and its body
 * (a flex column) must fit inside it.
 */
export function CardShell({
  icon,
  title,
  actions,
  className,
  bodyClassName,
  children,
}: {
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl bg-card p-5 shadow-card fit:min-h-0 fit:overflow-hidden",
        className,
      )}
    >
      <header className="mb-4 flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.02em] text-ink-2">
          <span className="text-ink-2 [&>svg]:size-[18px]" aria-hidden>
            {icon}
          </span>
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

/** The ↗ button that opens a feature's full page. */
export function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-ink-2 transition hover:bg-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowUpRight className="size-4" />
    </Link>
  );
}

/** Page grid: stacks on small screens, fills the viewport in the fit layout. */
export function PageGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-flow-row-dense md:grid-cols-2 fit:h-full fit:grid-cols-12", className)}>{children}</div>
  );
}
