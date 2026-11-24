"use client";

import { format } from "date-fns";
import { ArrowRight, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { recordEmail } from "@/app/actions/gmail";
import { saveBudget, saveTransaction } from "@/app/actions/transactions";
import { deleteWallet, saveTransfer, saveWallet } from "@/app/actions/wallets";
import type { Category } from "@/db/schema";
import {
  WALLET_TYPE_LABEL,
  WALLET_TYPES,
  type TxType,
  type WalletType,
} from "@/lib/constants";
import { nowIn } from "@/lib/dates";
import { formatIDR, formatNumber, parseAmount } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button, Field, FormError, Input, Segmented, Select, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { useViewerTz } from "@/components/ui/viewer-tz";
import { CategoryForm } from "./category-dialog";

/** What the forms need to know about a wallet. */
export type WalletLite = { id: number; name: string; type: WalletType };
export type WalletDetail = WalletLite & {
  openingBalance: number;
  balance: number;
  txCount: number;
  transferCount: number;
};

export function AmountInput({
  id,
  name = "amount",
  defaultValue = 0,
  allowNegative = false,
  required = true,
}: {
  id: string;
  name?: string;
  defaultValue?: number;
  allowNegative?: boolean;
  required?: boolean;
}) {
  const fmt = (n: number) => (n < 0 ? `-${formatNumber(-n)}` : formatNumber(n));
  const [value, setValue] = useState(defaultValue ? fmt(defaultValue) : "");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">Rp</span>
      <Input
        id={id}
        name={name}
        inputMode={allowNegative ? "text" : "numeric"}
        autoComplete="off"
        placeholder="0"
        required={required}
        className="pl-9 tabular"
        value={value}
        onChange={(e) => {
          const neg = allowNegative && e.target.value.trim().startsWith("-");
          const n = parseAmount(e.target.value);
          setValue(n ? `${neg ? "-" : ""}${formatNumber(n)}` : neg ? "-" : "");
        }}
      />
    </div>
  );
}

export { FormError } from "@/components/ui/primitives";

function WalletSelect({
  id,
  name,
  wallets,
  defaultValue,
}: {
  id: string;
  name: string;
  wallets: WalletLite[];
  defaultValue?: number;
}) {
  return (
    <Select id={id} name={name} defaultValue={defaultValue ?? wallets[0]?.id} required>
      {wallets.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name} · {WALLET_TYPE_LABEL[w.type]}
        </option>
      ))}
    </Select>
  );
}

/* ------------------------------------------------------------------ Transaction / transfer */

type Mode = TxType | "transfer";

/** Pre-filled values (e.g. read from a bank email). */
export type TransactionInitial = {
  amount?: number;
  title?: string;
  /** "yyyy-MM-ddTHH:mm" in the viewer's timezone. */
  date?: string;
  categoryId?: number | null;
  fromWalletId?: number | null;
  toWalletId?: number | null;
  note?: string;
};

/** Recording a reviewed email: saves through recordEmail and can remember the wallet. */
export type EmailRecording = { id: number; rememberLabel: string };

export function TransactionDialog({
  open,
  onOpenChange,
  categories,
  wallets,
  defaultType = "expense",
  defaultWalletId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Category[];
  wallets: WalletLite[];
  defaultType?: Mode;
  defaultWalletId?: number | null;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add to wallet"
      description="Expenses and income change one wallet. A transfer moves money between two of your wallets."
    >
      {open && (
        <TransactionForm
          categories={categories}
          wallets={wallets}
          defaultType={defaultType}
          defaultWalletId={defaultWalletId ?? undefined}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Modal>
  );
}

/** The normal Money form, pre-filled from a parsed email; saving also marks the email recorded. */
export function ReviewTransactionDialog({
  open,
  onOpenChange,
  categories,
  wallets,
  mode,
  walletId,
  initial,
  email,
  description,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Category[];
  wallets: WalletLite[];
  mode: Mode;
  walletId: number | null;
  initial: TransactionInitial;
  email: EmailRecording;
  description?: string;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record from email" description={description}>
      {open && (
        <TransactionForm
          categories={categories}
          wallets={wallets}
          defaultType={mode}
          defaultWalletId={walletId ?? undefined}
          initial={initial}
          email={email}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Modal>
  );
}

function TransactionForm({
  categories,
  wallets: allWallets,
  defaultType,
  defaultWalletId: requestedWalletId,
  initial = {},
  email,
  onDone,
}: {
  categories: Category[];
  wallets: WalletLite[];
  defaultType: Mode;
  defaultWalletId?: number;
  initial?: TransactionInitial;
  email?: EmailRecording;
  onDone: () => void;
}) {
  const uid = useId();
  const tz = useViewerTz();
  const [mode, setMode] = useState<Mode>(defaultType);
  const wallets = allWallets;
  const defaultWalletId = wallets.some((w) => w.id === requestedWalletId) ? requestedWalletId : undefined;
  const tx = useAction(saveTransaction, onDone);
  const tr = useAction(saveTransfer, onDone);
  const rec = useAction(recordEmail, onDone);
  const pending = tx.pending || tr.pending || rec.pending;
  const options = categories.filter((c) => c.type === mode);
  const known = (id: number | null | undefined) => (wallets.some((w) => w.id === id) ? (id ?? undefined) : undefined);
  const fromWallet = known(initial.fromWalletId) ?? defaultWalletId;
  const otherWallet = known(initial.toWalletId) ?? wallets.find((w) => w.id !== (fromWallet ?? wallets[0]?.id))?.id;
  const categoryDefault = options.some((c) => c.id === initial.categoryId) ? initial.categoryId! : options[0]?.id;
  const dateDefault = initial.date ?? format(nowIn(tz), "yyyy-MM-dd'T'HH:mm");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (email) rec.run(fd);
    else if (mode === "transfer") tr.run(fd);
    else tx.run(fd);
  };

  if (!wallets.length) {
    return <p className="text-sm text-muted">Add a bank, e-wallet or cash wallet first (Money → Wallets → +).</p>;
  }

  const modePicker = (
    <Segmented
      name="type"
      value={mode}
      onChange={setMode}
      options={[
        { value: "expense", label: "Expense" },
        { value: "income", label: "Income" },
        { value: "transfer", label: "Transfer" },
      ]}
    />
  );

  // No category of this type yet: create one right here, then the form appears.
  if (mode !== "transfer" && !options.length) {
    return (
      <div className="grid gap-4">
        {modePicker}
        <p className="rounded-lg bg-soft px-3 py-2 text-[13px] text-ink-2">
          You don&apos;t have any {mode} categories yet. Add one to continue.
        </p>
        <CategoryForm key={mode} category={null} type={mode} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {email && <input type="hidden" name="emailId" value={email.id} />}
      {modePicker}

      {mode === "transfer" ? (
        <>
          {wallets.length < 2 ? (
            <p className="rounded-lg bg-soft px-3 py-2 text-[13px] text-ink-2">You need at least two wallets to transfer.</p>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <Field label="From" htmlFor={`${uid}-from`}>
                <WalletSelect id={`${uid}-from`} name="fromWalletId" wallets={wallets} defaultValue={fromWallet} />
              </Field>
              <ArrowRight className="mb-3 size-4 text-muted" aria-hidden />
              <Field label="To" htmlFor={`${uid}-to`}>
                <WalletSelect id={`${uid}-to`} name="toWalletId" wallets={wallets} defaultValue={otherWallet} />
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor={`${uid}-amount`}>
              <AmountInput id={`${uid}-amount`} defaultValue={initial.amount} />
            </Field>
            <Field label="Date & time" htmlFor={`${uid}-date`}>
              <Input id={`${uid}-date`} name="date" type="datetime-local" defaultValue={dateDefault} required />
            </Field>
          </div>
          <Field label="Note (optional)" htmlFor={`${uid}-note`}>
            <Input id={`${uid}-note`} name="note" placeholder="e.g. Top up" maxLength={200} defaultValue={initial.note ?? initial.title} />
          </Field>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor={`${uid}-amount`}>
              <AmountInput id={`${uid}-amount`} defaultValue={initial.amount} />
            </Field>
            <Field label="Wallet" htmlFor={`${uid}-wallet`}>
              <WalletSelect id={`${uid}-wallet`} name="walletId" wallets={wallets} defaultValue={defaultWalletId} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor={`${uid}-cat`}>
              <Select id={`${uid}-cat`} name="categoryId" key={mode} defaultValue={categoryDefault} required>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date & time" htmlFor={`${uid}-date`}>
              <Input id={`${uid}-date`} name="date" type="datetime-local" defaultValue={dateDefault} required />
            </Field>
          </div>
          <Field label="Title" htmlFor={`${uid}-title`}>
            <Input
              id={`${uid}-title`}
              name="title"
              placeholder={mode === "expense" ? "e.g. Kopi Kenangan" : "e.g. Monthly salary"}
              defaultValue={initial.title}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Note (optional)" htmlFor={`${uid}-note`}>
            <Textarea id={`${uid}-note`} name="note" className="min-h-16" maxLength={500} />
          </Field>
        </>
      )}

      {email && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" name="remember" defaultChecked className="size-4 accent-[var(--color-ink)]" />
          Use {mode === "transfer" ? "these wallets" : "this wallet"} for all {email.rememberLabel} emails
        </label>
      )}
      <FormError error={tx.error ?? tr.error ?? rec.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (mode === "transfer" && wallets.length < 2)}>
          {pending ? "Saving…" : mode === "transfer" ? "Save transfer" : "Save transaction"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Wallet */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function WalletDialog({
  open,
  onOpenChange,
  wallet,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = create a new wallet */
  wallet: WalletDetail | null;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={wallet ? `Edit ${wallet.name}` : "New wallet"}
      description={
        wallet
          ? `Current balance ${formatIDR(wallet.balance)}`
          : "A bank account, e-wallet, cash or anything else that holds money. Stocks have their own tab."
      }
      size="sm"
    >
      {open && <WalletForm wallet={wallet} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function WalletForm({ wallet, onDone }: { wallet: WalletDetail | null; onDone: () => void }) {
  const uid = useId();
  const save = useAction(saveWallet, onDone);
  const remove = useAction(deleteWallet, onDone);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [type, setType] = useState<WalletType>(wallet?.type ?? "bank");
  const [name, setName] = useState(wallet?.name ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
      className="grid gap-4"
    >
      {wallet && <input type="hidden" name="id" value={wallet.id} />}
      <Field label="Name" htmlFor={`${uid}-name`}>
        <Input
          id={`${uid}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. BCA, GoPay, Cash"
          required
          maxLength={40}
          autoFocus
        />
      </Field>
      <Field label="Type" htmlFor={`${uid}-type`}>
        <Select id={`${uid}-type`} name="type" value={type} onChange={(e) => setType(e.target.value as WalletType)}>
          {WALLET_TYPES.map((t) => (
            <option key={t} value={t}>
              {WALLET_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      {wallet ? (
        <Field label="Balance" htmlFor={`${uid}-balance`} hint="Changing it records a balance adjustment. Start with - for debt.">
          <AmountInput id={`${uid}-balance`} name="balance" defaultValue={wallet.balance} allowNegative required={false} />
        </Field>
      ) : (
        <Field label="Starting balance" htmlFor={`${uid}-opening`} hint="What it holds right now. Start with - for debt.">
          <AmountInput id={`${uid}-opening`} name="openingBalance" defaultValue={0} allowNegative required={false} />
        </Field>
      )}

      <FormError error={save.error ?? remove.error} />

      {wallet && confirmDelete && (
        <div className="grid gap-3 rounded-xl border border-down/30 bg-down-soft/50 p-3">
          <p className="text-[13px] text-ink-2">
            Delete {wallet.name}
            {wallet.txCount > 0 && ` and its ${plural(wallet.txCount, "transaction")}`}? Its{" "}
            balance of <span className="font-medium tabular">{formatIDR(wallet.balance)}</span> is
            removed from net worth.
            {wallet.transferCount > 0 &&
              ` Its ${plural(wallet.transferCount, "transfer")} with other wallets stay in history, so their balances don't change.`}{" "}
            This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep wallet
            </Button>
            <Button
              className="bg-down text-white hover:bg-down/90"
              disabled={remove.pending}
              onClick={() => remove.run(wallet.id)}
            >
              {remove.pending ? "Deleting…" : `Delete ${wallet.name}`}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {wallet && !confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Saving…" : wallet ? "Save" : "Add wallet"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Budget */

export function BudgetDialog({
  open,
  onOpenChange,
  month,
  monthLabel,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  month: string;
  monthLabel: string;
  current: number;
}) {
  const uid = useId();
  const { run, pending, error } = useAction(saveBudget, () => onOpenChange(false));
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Monthly budget" description={`Spending limit for ${monthLabel}, across all wallets.`} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(new FormData(e.currentTarget));
        }}
        className="grid gap-4"
      >
        <input type="hidden" name="month" value={month} />
        <Field label="Budget" htmlFor={`${uid}-amount`}>
          <AmountInput id={`${uid}-amount`} defaultValue={current} />
        </Field>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save budget"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
