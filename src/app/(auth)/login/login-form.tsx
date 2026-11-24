"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ComponentProps } from "react";
import { Eye, EyeOff, Lock, Mail, Sparkles, type LucideIcon } from "lucide-react";
import { startDemo } from "@/app/actions/demo";
import { FormError } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { authClient } from "@/lib/auth-client";

function IconInput({ icon: Icon, label, className, ...props }: ComponentProps<"input"> & { icon: LucideIcon; label: string }) {
  return (
    <div className="relative">
      <label htmlFor={props.id} className="sr-only">
        {label}
      </label>
      <Icon className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-faint" />
      <input
        placeholder={label}
        className={cn(
          "h-12 w-full rounded-xl border border-transparent bg-[#f1f3f5] pl-11 pr-4 text-[15px] text-ink placeholder:text-faint transition",
          "focus:border-[#d4d5d8] focus:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d4d5d8]/60",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function LoginForm({ next, demo }: { next: string; demo: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [demoPending, startDemoTransition] = useTransition();
  const busy = pending || demoPending;
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  return (
    <form
      className="mt-7 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const { error } = await authClient.signIn.email({
            email: String(fd.get("email") ?? "").trim(),
            password: String(fd.get("password") ?? ""),
            rememberMe: true,
          });
          if (error) {
            // One message for wrong email and wrong password, so accounts can't be probed.
            setError(
              error.status === 429
                ? "Too many attempts. Wait a minute and try again."
                : "That email and password don't match.",
            );
            return;
          }
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <IconInput icon={Mail} label="Email" id={`${uid}-email`} name="email" type="email" autoComplete="username" required autoFocus />
      <div className="relative">
        <IconInput
          icon={Lock}
          label="Password"
          id={`${uid}-password`}
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setShowPassword((s) => !s)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {showPassword ? <Eye className="size-[18px]" /> : <EyeOff className="size-[18px]" />}
        </button>
      </div>

      <div className="-mt-0.5 flex justify-end">
        <button
          type="button"
          onClick={() => setShowForgot((s) => !s)}
          aria-expanded={showForgot}
          className="rounded text-[13.5px] font-medium text-ink-2 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          Forgot password?
        </button>
      </div>
      {showForgot && (
        <p className="animate-fade-in rounded-xl bg-[#f1f2f4] px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
          Ask the owner to reset it. You&apos;ll get a temporary password and choose a new one when you sign in.
        </p>
      )}

      <FormError error={error} />

      <button
        type="submit"
        disabled={busy}
        className={cn(
          "mt-1 h-12 w-full rounded-xl bg-linear-to-b from-[#3d3d42] to-[#111113] text-[15px] font-medium text-white",
          "shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_10px_24px_-10px_rgb(0_0_0/0.55)] ring-1 ring-black",
          "transition hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_14px_28px_-10px_rgb(0_0_0/0.6)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-60",
        )}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {demo && (
        <>
          {/* Dotted divider, like the reference's "Or sign in with". */}
          <div className="mt-2 flex items-center gap-3 text-[13px] text-muted" aria-hidden>
            <span className="h-px flex-1 bg-[radial-gradient(circle,#c9cbcf_1px,transparent_1.2px)] bg-[length:8px_2px] bg-repeat-x" />
            or just look around
            <span className="h-px flex-1 bg-[radial-gradient(circle,#c9cbcf_1px,transparent_1.2px)] bg-[length:8px_2px] bg-repeat-x" />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              startDemoTransition(async () => {
                const r = await startDemo(); // redirects on success
                if (r && !r.ok) setError(r.error);
              });
            }}
            className={cn(
              "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-medium text-ink",
              "shadow-[0_1px_2px_rgb(0_0_0/0.05),0_6px_16px_-10px_rgb(0_0_0/0.3)] ring-1 ring-[#e3e4e7] transition hover:-translate-y-px hover:ring-[#cfd1d5]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-60",
            )}
          >
            <Sparkles className="size-[18px] text-ink-2" />
            {demoPending ? "Preparing your demo…" : "Try the demo"}
          </button>
          <p className="text-balance text-center text-[12.5px] leading-relaxed text-muted">
            A private sandbox with sample data, deleted after 1 hour.
          </p>
        </>
      )}
    </form>
  );
}
