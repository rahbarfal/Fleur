"use client";

import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { deleteCategory, saveCategory } from "@/app/actions/categories";
import type { Category } from "@/db/schema";
import { cn } from "@/lib/cn";
import { CATEGORY_ICONS, type TxType } from "@/lib/constants";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Modal } from "@/components/ui/modal";
import { Button, EmptyState, Field, FormError, Input, Segmented, Select } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/use-action";

const TYPE_LABEL: Record<TxType, string> = { expense: "Expense", income: "Income" };

/** Add, rename, re-icon and delete income/expense categories. */
export function CategoriesDialog({
  open,
  onOpenChange,
  categories,
  usage,
  defaultType = "expense",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Category[];
  /** Transactions per category id. */
  usage: Record<number, number>;
  defaultType?: TxType;
}) {
  const [type, setType] = useState<TxType>(defaultType);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const list = categories.filter((c) => c.type === type);

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setEditing(null);
      }}
      title={editing === "new" ? `New ${TYPE_LABEL[type].toLowerCase()} category` : editing ? `Edit ${editing.name}` : "Categories"}
      description={editing ? undefined : "Group your income and expenses. Deleting a category keeps its transactions."}
      size="sm"
    >
      {editing ? (
        <CategoryForm
          key={editing === "new" ? "new" : editing.id}
          category={editing === "new" ? null : editing}
          type={type}
          others={categories.filter((c) => c.type === type && c.id !== (editing === "new" ? -1 : editing.id))}
          used={editing === "new" ? 0 : (usage[editing.id] ?? 0)}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="grid gap-3">
          <Segmented
            name="category-type"
            value={type}
            onChange={setType}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
          {list.length ? (
            <ul className="grid gap-1.5">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="flex h-12 w-full items-center gap-3 rounded-xl border border-line px-2.5 text-left transition hover:border-faint focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <CategoryIcon name={c.icon} className="size-8" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{c.name}</span>
                    <span className="shrink-0 text-[12px] text-muted tabular">
                      {usage[c.id] ?? 0} tx
                    </span>
                    <Pencil className="size-3.5 shrink-0 text-faint" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No {TYPE_LABEL[type].toLowerCase()} categories yet.</EmptyState>
          )}
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New {TYPE_LABEL[type].toLowerCase()} category
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Create or edit one category. Also used inline when a transaction form has no categories. */
export function CategoryForm({
  category,
  type,
  others = [],
  used = 0,
  onDone,
  onCancel,
}: {
  category: Category | null;
  type: TxType;
  /** Same-type categories its transactions can move to on delete. */
  others?: Category[];
  used?: number;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const uid = useId();
  const save = useAction(saveCategory, onDone);
  const remove = useAction(deleteCategory, onDone);
  const [icon, setIcon] = useState<string>(category?.icon ?? "circle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveTo, setMoveTo] = useState<number | null>(others[0]?.id ?? null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
      className="grid gap-4"
    >
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="type" value={category?.type ?? type} />
      <input type="hidden" name="icon" value={icon} />
      <Field label="Name" htmlFor={`${uid}-name`}>
        <Input
          id={`${uid}-name`}
          name="name"
          defaultValue={category?.name}
          placeholder={type === "expense" ? "e.g. Food & Drink" : "e.g. Salary"}
          required
          maxLength={40}
          autoFocus
        />
      </Field>
      <div className="grid gap-1.5">
        <span className="text-[13px] font-medium text-ink-2" id={`${uid}-icon`}>
          Icon
        </span>
        <div role="radiogroup" aria-labelledby={`${uid}-icon`} className="grid grid-cols-6 gap-1.5">
          {CATEGORY_ICONS.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={icon === name}
              aria-label={name.replace(/-/g, " ")}
              title={name.replace(/-/g, " ")}
              onClick={() => setIcon(name)}
              className={cn(
                "flex justify-center rounded-xl p-1 transition focus-visible:outline-2 focus-visible:outline-accent",
                icon === name ? "bg-ink/5 ring-2 ring-ink" : "hover:bg-soft",
              )}
            >
              <CategoryIcon name={name} className="size-8" />
            </button>
          ))}
        </div>
      </div>

      <FormError error={save.error ?? remove.error} />

      {category && confirmDelete && (
        <div className="grid gap-3 rounded-xl border border-down/30 bg-down-soft/50 p-3">
          {used > 0 ? (
            <Field label={`Move its ${used} transaction${used === 1 ? "" : "s"} to`} htmlFor={`${uid}-move`}>
              <Select
                id={`${uid}-move`}
                value={moveTo ?? ""}
                onChange={(e) => setMoveTo(e.target.value ? Number(e.target.value) : null)}
              >
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="">Leave uncategorized</option>
              </Select>
            </Field>
          ) : (
            <p className="text-[13px] text-ink-2">No transactions use this category.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              className="bg-down text-white hover:bg-down/90"
              disabled={remove.pending}
              onClick={() => remove.run(category.id, used > 0 ? moveTo : null)}
            >
              {remove.pending ? "Deleting…" : `Delete ${category.name}`}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {category && !confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : onCancel && !category ? (
          <Button variant="ghost" onClick={onCancel}>
            <ChevronLeft className="size-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {onCancel && category && (
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Saving…" : category ? "Save" : "Add category"}
          </Button>
        </div>
      </div>
    </form>
  );
}
