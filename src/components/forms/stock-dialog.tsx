"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { deleteStock, saveStock } from "@/app/actions/stocks";
import { LOT_SIZE, STOCKS, type StockSymbol } from "@/lib/constants";
import { formatIDR, formatNumber } from "@/lib/format";
import type { StockHoldingView } from "@/lib/queries/stocks";
import { Modal } from "@/components/ui/modal";
import { Button, Field, FormError, Input, Select } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";

/** Add a stock you hold (one per ticker) or change its lots. */
export function StockDialog({
  open,
  onOpenChange,
  stock,
  taken,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = add a new stock */
  stock: StockHoldingView | null;
  /** Tickers you already hold. */
  taken: StockSymbol[];
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={stock ? `Edit ${stock.symbol}` : "Add stock"}
      description={stock ? `${stock.company} · value ${formatIDR(stock.value)}` : "How many lots you hold. It's valued at the live price."}
      size="sm"
    >
      {open && <StockForm stock={stock} taken={taken} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function StockForm({ stock, taken, onDone }: { stock: StockHoldingView | null; taken: StockSymbol[]; onDone: () => void }) {
  const uid = useId();
  const save = useAction(saveStock, onDone);
  const remove = useAction(deleteStock, onDone);
  const free = STOCKS.filter((s) => !taken.includes(s.symbol));
  const [lots, setLots] = useState(stock ? String(stock.lots) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lotsNumber = Number.parseInt(lots, 10) || 0;
  const price = stock?.price ?? null;

  if (!stock && !free.length) {
    return <p className="text-sm text-muted">You already hold every stock Fleur tracks ({STOCKS.map((s) => s.symbol).join(", ")}). Edit their lots instead.</p>;
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
    >
      {stock ? (
        <>
          <input type="hidden" name="id" value={stock.id} />
          <p className="rounded-lg bg-soft px-3 py-2 text-[13px] text-ink-2">
            {stock.company} ({stock.symbol})
            {price !== null && (
              <>
                {" "}· <span className="tabular">{formatIDR(price)}</span> per share
                {stock.asOfLabel && (
                  <span className="text-muted">
                    {" "}· {stock.stale ? "last known, " : ""}
                    {stock.asOfLabel}
                  </span>
                )}
              </>
            )}
          </p>
        </>
      ) : (
        <Field label="Stock" htmlFor={`${uid}-symbol`}>
          <Select id={`${uid}-symbol`} name="symbol" defaultValue={free[0]?.symbol} required>
            {STOCKS.map((s) => (
              <option key={s.symbol} value={s.symbol} disabled={taken.includes(s.symbol)}>
                {s.symbol} · {s.name}
                {taken.includes(s.symbol) ? " (already added)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Lots"
        htmlFor={`${uid}-lots`}
        hint={
          price !== null
            ? `${formatNumber(lotsNumber * LOT_SIZE)} shares ≈ ${formatIDR(Math.round(lotsNumber * LOT_SIZE * price))}`
            : `1 lot = ${LOT_SIZE} shares.`
        }
      >
        <Input
          id={`${uid}-lots`}
          name="lots"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          required
          autoFocus
          className="tabular"
          value={lots}
          onChange={(e) => setLots(e.target.value.replace(/\D/g, "").slice(0, 7))}
        />
      </Field>

      <FormError error={save.error ?? remove.error} />

      {stock && confirmDelete && (
        <div className="grid gap-3 rounded-xl border border-down/30 bg-down-soft/50 p-3">
          <p className="text-[13px] text-ink-2">
            Remove {stock.symbol} ({formatIDR(stock.value)}) from your net worth? This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button className="bg-down text-white hover:bg-down/90" disabled={remove.pending} onClick={() => remove.run(stock.id)}>
              {remove.pending ? "Removing…" : `Remove ${stock.symbol}`}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {stock && !confirmDelete ? (
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
            {save.pending ? "Saving…" : stock ? "Save" : "Add stock"}
          </Button>
        </div>
      </div>
    </form>
  );
}
