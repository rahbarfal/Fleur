"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { deleteDebt, saveDebt } from "@/app/actions/debts";
import { DEBT_KIND_LABEL, DEBT_KINDS, type DebtCycle, type DebtKind } from "@/lib/constants";
import { MONTHS_LONG } from "@/lib/dates";
import type { DebtView } from "@/lib/queries/debts";
import { Modal } from "@/components/ui/modal";
import { Button, Field, FormError, Input, Segmented, Select } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";
import { AmountInput } from "./finance-dialogs";

const NAME_HINT: Record<DebtKind, string> = {
  credit_card: "e.g. BCA Visa",
  online_credit: "e.g. Kredivo, SPayLater",
  subscription: "e.g. Netflix, Spotify",
  other: "e.g. Laptop installment",
};

const DUE_LABEL: Record<DebtKind, string> = {
  credit_card: "Payment due day",
  online_credit: "Installment due day",
  subscription: "Renews on day",
  other: "Due day",
};

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Add or edit a credit card, online credit, subscription… (tracked apart from net worth). */
export function DebtDialog({
  open,
  onOpenChange,
  debt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = add a new one */
  debt: DebtView | null;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={debt ? `Edit ${debt.name}` : "Add debt"}
      description="A credit card, online credit or subscription. Tracked on its own: it doesn't change your wallets or net worth."
      size="sm"
    >
      {open && <DebtForm debt={debt} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function DebtForm({ debt, onDone }: { debt: DebtView | null; onDone: () => void }) {
  const uid = useId();
  const save = useAction(saveDebt, onDone);
  const remove = useAction(deleteDebt, onDone);
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? "credit_card");
  const [cycle, setCycle] = useState<DebtCycle>(debt?.cycle ?? "monthly");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sub = kind === "subscription";
  const yearly = sub && cycle === "yearly";

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
    >
      {debt && <input type="hidden" name="id" value={debt.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${uid}-kind`}>
          <Select id={`${uid}-kind`} name="kind" value={kind} onChange={(e) => setKind(e.target.value as DebtKind)}>
            {DEBT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DEBT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor={`${uid}-name`}>
          <Input
            id={`${uid}-name`}
            name="name"
            defaultValue={debt?.name}
            placeholder={NAME_HINT[kind]}
            required
            maxLength={40}
            autoFocus
          />
        </Field>
      </div>

      {sub ? (
        <>
          <Segmented
            name="cycle"
            value={cycle}
            onChange={setCycle}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
            ]}
          />
          <Field label={yearly ? "Price per year" : "Price per month"} htmlFor={`${uid}-amount`}>
            <AmountInput id={`${uid}-amount`} defaultValue={debt?.amount} />
          </Field>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owed now" htmlFor={`${uid}-amount`}>
            <AmountInput id={`${uid}-amount`} defaultValue={debt?.amount} required={false} />
          </Field>
          {kind === "credit_card" || kind === "online_credit" ? (
            <Field label="Limit (optional)" htmlFor={`${uid}-limit`}>
              <AmountInput key="limit" id={`${uid}-limit`} name="creditLimit" defaultValue={debt?.creditLimit ?? 0} required={false} />
            </Field>
          ) : (
            <Field label="Per month (optional)" htmlFor={`${uid}-installment`}>
              <AmountInput key="installment" id={`${uid}-installment`} name="installment" defaultValue={debt?.installment ?? 0} required={false} />
            </Field>
          )}
        </div>
      )}

      {kind === "online_credit" && (
        <Field label="Installment per month (optional)" htmlFor={`${uid}-installment`} hint="Used to estimate how many months are left.">
          <AmountInput id={`${uid}-installment`} name="installment" defaultValue={debt?.installment ?? 0} required={false} />
        </Field>
      )}

      {yearly ? (
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field label="Renews on" htmlFor={`${uid}-month`}>
            <Select id={`${uid}-month`} name="dueMonth" defaultValue={debt?.dueMonth ?? ""}>
              <option value="">— Month</option>
              {MONTHS_LONG.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Day" htmlFor={`${uid}-due`}>
            <DaySelect id={`${uid}-due`} defaultValue={debt?.dueDay} />
          </Field>
        </div>
      ) : (
        <Field
          label={`${DUE_LABEL[kind]} (optional)`}
          htmlFor={`${uid}-due`}
          hint="Repeats every month. Short months use their last day."
        >
          <DaySelect id={`${uid}-due`} defaultValue={debt?.dueDay} />
        </Field>
      )}

      <Field label="Note (optional)" htmlFor={`${uid}-note`}>
        <Input id={`${uid}-note`} name="note" defaultValue={debt?.note ?? ""} maxLength={200} placeholder="e.g. Paid from BCA" />
      </Field>

      <FormError error={save.error ?? remove.error} />

      {debt && confirmDelete && (
        <div className="grid gap-3 rounded-xl border border-down/30 bg-down-soft/50 p-3">
          <p className="text-[13px] text-ink-2">Remove {debt.name}? Your wallets don&apos;t change. This can&apos;t be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button className="bg-down text-white hover:bg-down/90" disabled={remove.pending} onClick={() => remove.run(debt.id)}>
              {remove.pending ? "Removing…" : `Remove ${debt.name}`}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {debt && !confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Saving…" : debt ? "Save" : `Add ${sub ? "subscription" : "debt"}`}
          </Button>
        </div>
      </div>
    </form>
  );
}

function DaySelect({ id, defaultValue }: { id: string; defaultValue?: number | null }) {
  return (
    <Select id={id} name="dueDay" defaultValue={defaultValue ?? ""}>
      <option value="">—</option>
      {DAYS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </Select>
  );
}
