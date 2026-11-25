import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowUpRight, LogIn } from "lucide-react";
import { demoEnabled } from "@/lib/demo/demo";
import { getViewer } from "@/lib/viewer";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Fleur" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Only same-site paths, so ?next= can't send people to another website. */
function safeNext(raw: unknown): string {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const next = safeNext(sp.next);
  if (viewer) redirect(viewer.mustChangePassword ? "/account" : next);

  return (
    <div className="relative animate-pop-in overflow-hidden rounded-[32px] bg-linear-to-b from-[#d4d5d8]/95 via-white/90 to-white/95 p-7 shadow-pop ring-1 ring-[#dcdde0] backdrop-blur-md sm:p-10">
      <div aria-hidden className="login-dots pointer-events-none absolute inset-x-0 top-0 h-2/5" />
      <div className="relative">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-ink-2 shadow-[0_10px_24px_-8px_rgb(17_17_17/0.22),0_1px_2px_rgb(0_0_0/0.06)]">
          <LogIn className="size-6" strokeWidth={2.2} />
        </span>
        <h1 className="mt-6 text-center text-[24px] font-semibold tracking-tight text-ink">Sign in to Fleur</h1>
        <p className="mx-auto mt-1.5 max-w-[300px] text-center text-[14px] leading-relaxed text-muted">
          Your money, inbox, workouts and notes in one place. Accounts are invite-only.
        </p>
        <LoginForm next={next} demo={demoEnabled()} />
        <p className="mt-6 border-t border-[#e3e4e7] pt-4 text-center text-[12.5px] text-muted">
          Made by{" "}
          <a
            href="https://naufal-akbar-rahardjo.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-ink-2 underline-offset-2 transition hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Naufal Akbar Rahardjo
            <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
          </a>
        </p>
      </div>
    </div>
  );
}
