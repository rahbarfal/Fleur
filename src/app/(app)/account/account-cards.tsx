"use client";

import { KeyRound, LogOut, Mail, MonitorSmartphone, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { revokeOtherSessions, revokeSession, updateProfile } from "@/app/actions/account";
import { endDemo } from "@/app/actions/demo";
import { deleteKeptEmails, unlinkGmail } from "@/app/actions/gmail";
import type { GmailStatus } from "@/lib/queries/email";
import { Modal } from "@/components/ui/modal";
import { CardShell } from "@/components/dashboard/card-shell";
import { Button, Field, FormError, Input, Select } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

export type SessionView = {
  id: string;
  device: string;
  ip: string | null;
  current: boolean;
  signedInLabel: string;
  activeAgo: string;
};

function Saved({ show }: { show: boolean }) {
  return show ? (
    <p role="status" className="rounded-lg bg-up-soft px-3 py-2 text-[13px] text-up">
      Saved.
    </p>
  ) : null;
}

export function ProfileCard({
  name,
  email,
  timezone,
  timezones,
  className,
}: {
  name: string;
  email: string;
  timezone: string;
  timezones: { value: string; label: string }[];
  className?: string;
}) {
  const uid = useId();
  const [saved, setSaved] = useState(false);
  const save = useAction(updateProfile, () => setSaved(true));

  return (
    <CardShell icon={<UserRound />} title="Profile" className={className}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.run(new FormData(e.currentTarget));
        }}
      >
        <Field label="Name" htmlFor={`${uid}-name`}>
          <Input id={`${uid}-name`} name="name" defaultValue={name} required maxLength={60} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor={`${uid}-email`} hint="Ask the owner to change it.">
          <Input id={`${uid}-email`} value={email} readOnly disabled />
        </Field>
        <Field
          label="Timezone"
          htmlFor={`${uid}-tz`}
          hint="Decides when your days and months start: budgets, charts and the workout calendar."
        >
          <Select id={`${uid}-tz`} name="timezone" defaultValue={timezone}>
            {timezones.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </Select>
        </Field>
        <FormError error={save.error} />
        <Saved show={saved && !save.pending} />
        <div className="flex justify-end">
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </CardShell>
  );
}

export function PasswordCard({ mustChange, className }: { mustChange: boolean; className?: string }) {
  const uid = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <CardShell icon={<KeyRound />} title="Password" className={className}>
      {mustChange && (
        <p className="mb-4 rounded-lg bg-accent/10 px-3 py-2 text-[13px] text-ink">
          You signed in with a temporary password. Choose your own to continue.
        </p>
      )}
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const currentPassword = String(fd.get("current") ?? "");
          const newPassword = String(fd.get("new") ?? "");
          setError(null);
          setSaved(false);
          if (newPassword.length < 12) return setError("Use at least 12 characters.");
          if (newPassword !== fd.get("confirm")) return setError("The new passwords don't match.");
          if (newPassword === currentPassword) return setError("Pick a password different from the current one.");
          start(async () => {
            const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
            if (error) {
              setError(
                error.status === 429
                  ? "Too many attempts. Wait a minute and try again."
                  : error.code === "INVALID_PASSWORD"
                    ? "Your current password is wrong."
                    : (error.message ?? "Couldn't change the password."),
              );
              return;
            }
            form.reset();
            setSaved(true);
            if (mustChange) router.replace("/");
            router.refresh();
          });
        }}
      >
        <Field label="Current password" htmlFor={`${uid}-current`}>
          <Input id={`${uid}-current`} name="current" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="New password" htmlFor={`${uid}-new`} hint="At least 12 characters. A short sentence works well.">
          <Input id={`${uid}-new`} name="new" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        </Field>
        <Field label="Repeat new password" htmlFor={`${uid}-confirm`}>
          <Input id={`${uid}-confirm`} name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <FormError error={error} />
        <Saved show={saved && !pending} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-muted">Other devices will be signed out.</span>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </CardShell>
  );
}

/** Shown instead of Password and Gmail in a "Try the demo" sandbox. */
export function DemoCard({ endsLabel, className }: { endsLabel: string; className?: string }) {
  return (
    <CardShell icon={<Sparkles />} title="Demo" className={className}>
      <div className="grid gap-3 text-[13.5px] leading-relaxed text-ink-2">
        <p>
          This is a private demo sandbox filled with sample data. Change anything you like: nobody else sees it.
        </p>
        <p>
          It&apos;s deleted, with everything in it, at <span className="font-semibold text-ink">{endsLabel}</span>. Password
          and Gmail settings aren&apos;t part of the demo.
        </p>
        <form action={endDemo}>
          <Button type="submit" variant="secondary">
            <LogOut className="size-4" /> Exit demo now
          </Button>
        </form>
      </div>
    </CardShell>
  );
}

export function SessionsCard({ sessions, className }: { sessions: SessionView[]; className?: string }) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const revoke = useAction(revokeSession);
  const revokeOthers = useAction(revokeOtherSessions);
  const others = sessions.filter((s) => !s.current).length;

  return (
    <CardShell icon={<MonitorSmartphone />} title="Signed-in devices" className={className}>
      <ul className="scroll-quiet grid content-start gap-2 overflow-y-auto fit:min-h-0 fit:flex-1">
        {sessions.map((s) => (
          <li key={s.id} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", s.current ? "border-ink" : "border-line")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">
                {s.device}
                {s.current && <span className="ml-2 rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white">This device</span>}
              </p>
              <p className="truncate text-[12px] text-muted">
                Signed in {s.signedInLabel} · active {s.activeAgo}
                {s.ip ? ` · ${s.ip}` : ""}
              </p>
            </div>
            {!s.current && (
              <Button variant="danger" className="h-8 px-2.5 text-[13px]" disabled={revoke.pending} onClick={() => revoke.run(s.id)}>
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      <FormError error={revoke.error ?? revokeOthers.error} />
      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" disabled={!others || revokeOthers.pending} onClick={() => revokeOthers.run()}>
          Sign out other devices
        </Button>
        <Button
          disabled={signingOut}
          onClick={() =>
            startSignOut(async () => {
              await authClient.signOut();
              router.replace("/login");
              router.refresh();
            })
          }
        >
          <LogOut className="size-4" /> {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </CardShell>
  );
}

export function GmailCard({ gmail, className }: { gmail: GmailStatus; className?: string }) {
  const [open, setOpen] = useState(false);
  const [wipe, setWipe] = useState(false);
  const unlink = useAction(unlinkGmail, () => setOpen(false));
  const removeKept = useAction(deleteKeptEmails);
  const n = gmail.emailCount;
  const emailsText = `${n} synced email${n === 1 ? "" : "s"}`;

  return (
    <CardShell icon={<Mail />} title="Gmail" className={className}>
      {gmail.linked ? (
        <div className="grid gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{gmail.address}</p>
            <p className="text-[12px] text-muted">
              Linked {gmail.linkedLabel} · {gmail.lastSyncAgo ? `synced ${gmail.lastSyncAgo}` : "not synced yet"} · {emailsText}
            </p>
          </div>
          {gmail.needsReconnect && (
            <p className="rounded-lg bg-down-soft px-3 py-2 text-[13px] text-down">
              Google stopped Fleur&apos;s access.{" "}
              <Link href="/email" className="font-medium underline underline-offset-2">
                Reconnect on the Email page
              </Link>
              .
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted">Read-only access</span>
            <Button variant="secondary" className="h-8 px-3 text-[13px]" onClick={() => setOpen(true)}>
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[13px] text-ink-2">
            Not linked ·{" "}
            <Link href="/email" className="font-medium text-ink underline underline-offset-2">
              connect it on the Email page
            </Link>
          </p>
          {n > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-muted">{n} email{n === 1 ? "" : "s"} kept from before</span>
              <Button variant="danger" className="h-8 px-2.5 text-[13px]" disabled={removeKept.pending} onClick={() => removeKept.run()}>
                Delete them
              </Button>
            </div>
          )}
          <FormError error={removeKept.error} />
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setWipe(false);
        }}
        title="Unlink Gmail?"
        size="sm"
        description={gmail.address ?? undefined}
      >
        <div className="grid gap-4">
          <p className="text-[14px] text-ink-2">
            Fleur stops reading this inbox and its access at Google is revoked. You can link again later.
          </p>
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={wipe}
              onChange={(e) => setWipe(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-ink)]"
            />
            <span>
              Also delete the {emailsText}. Transactions recorded from them stay in Money.
            </span>
          </label>
          <FormError error={unlink.error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={wipe ? "danger" : "primary"} disabled={unlink.pending} onClick={() => unlink.run(wipe)}>
              {unlink.pending ? "Unlinking…" : wipe ? "Unlink and delete emails" : "Unlink"}
            </Button>
          </div>
        </div>
      </Modal>
    </CardShell>
  );
}
