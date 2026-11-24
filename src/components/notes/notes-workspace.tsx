"use client";

import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen, PenLine, Pin, Plus, Search, StickyNote } from "lucide-react";
import { useRef, useState } from "react";
import type { NoteView } from "@/lib/queries/notes";
import { cn } from "@/lib/cn";
import { CardShell } from "@/components/dashboard/card-shell";
import { NOTE_ICONS, type NoteIcon } from "@/lib/constants";
import { Pager } from "@/components/ui/pager";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { useFitCount, usePaged } from "@/components/ui/use-fit";
import { useStoredState } from "@/components/ui/use-stored-state";
import { NOTE_ICON_COMPONENTS, NoteBadge, noteIconLabel } from "./note-badge";
import { NoteDocument } from "./note-document";

type Selection = number | "new";
/** Logo filter: everything, notes without a logo, or one logo. */
type Filter = "all" | "none" | NoteIcon;

const FILTERS: readonly Filter[] = ["all", "none", ...NOTE_ICONS];

/** Keeps ?note= in the address bar in step, without a navigation. */
function showInUrl(s: Selection) {
  window.history.replaceState(null, "", s === "new" ? "/notes" : `/notes?note=${s}`);
}

export function NotesWorkspace({ notes: initialNotes, initialId }: { notes: NoteView[]; initialId: number | null }) {
  // The list lives here: autosaves update it in place, without reloading the page.
  const [notes, setNotes] = useState(initialNotes);
  const [selected, setSelectedState] = useState<Selection>(initialId ?? initialNotes[0]?.id ?? "new");
  // Saves finish after you may have moved on: they check what's open now, not what was open then.
  const selectedRef = useRef(selected);
  const setSelected = (s: Selection) => {
    selectedRef.current = s;
    setSelectedState(s);
  };
  // Bumped only when you switch notes, so a new note getting its id doesn't reset the editor.
  const [editorKey, setEditorKey] = useState(0);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const [query, setQuery] = useState("");
  // Remembered per browser.
  const [collapsedValue, setCollapsedValue] = useStoredState("fleur.notes.collapsed", "0", ["0", "1"] as const);
  const [filter, chooseFilter] = useStoredState<Filter>("fleur.notes.filter", "all", FILTERS);
  const collapsed = collapsedValue === "1";
  const toggleCollapsed = () => setCollapsedValue(collapsed ? "0" : "1");

  // Logos in use (in NOTE_ICONS order) with counts, for the filter chips.
  const usedIcons = NOTE_ICONS.map((icon) => ({ icon, count: notes.filter((n) => n.icon === icon).length })).filter(
    (g) => g.count > 0,
  );
  const noLogoCount = notes.filter((n) => !n.icon).length;
  // A filter whose logo is no longer used falls back to All.
  const activeFilter: Filter =
    filter === "all" || (filter === "none" ? noLogoCount > 0 : usedIcons.some((g) => g.icon === filter)) ? filter : "all";

  const q = query.trim().toLowerCase();
  const filtered = notes.filter(
    (n) =>
      (activeFilter === "all" || (activeFilter === "none" ? !n.icon : n.icon === activeFilter)) &&
      (!q || `${n.title}\n${n.content}`.toLowerCase().includes(q)),
  );
  const current = typeof selected === "number" ? (notes.find((n) => n.id === selected) ?? null) : null;

  /** Opens another note right away; the one you leave finishes saving in the background. */
  const choose = (s: Selection) => {
    if (s === selected) return;
    void flushRef.current?.();
    setSelected(s);
    setEditorKey((k) => k + 1);
    showInUrl(s);
  };

  const onSaved = (saved: NoteView, created: boolean) => {
    setNotes((list) => {
      if (!list.some((n) => n.id === saved.id)) {
        // New notes go to the top (after pinned ones).
        const at = saved.pinned ? 0 : list.findIndex((n) => !n.pinned);
        const copy = [...list];
        copy.splice(at === -1 ? copy.length : at, 0, saved);
        return copy;
      }
      return list.map((n) => (n.id === saved.id ? saved : n));
    });
    if (created && selectedRef.current === "new") {
      setSelected(saved.id);
      showInUrl(saved.id);
    }
  };

  const onDeleted = (id: number) => {
    const rest = notes.filter((n) => n.id !== id);
    setNotes(rest);
    const next = rest[0]?.id ?? "new";
    setSelected(next);
    setEditorKey((k) => k + 1);
    showInUrl(next);
  };

  return (
    <div className="grid gap-4 md:col-span-2 fit:col-span-12 fit:min-h-0 fit:grid-cols-[auto_minmax(0,1fr)] fit:grid-rows-[minmax(0,1fr)]">
      {collapsed ? (
        <NotesRail notes={filtered} selected={selected} onChoose={choose} onExpand={toggleCollapsed} />
      ) : (
        <NotesSidebar
          notes={filtered}
          total={notes.length}
          selected={selected}
          onChoose={choose}
          onCollapse={toggleCollapsed}
          query={query}
          onQuery={setQuery}
          filter={activeFilter}
          onFilter={chooseFilter}
          usedIcons={usedIcons}
          noLogoCount={noLogoCount}
        />
      )}

      <CardShell icon={<PenLine />} title={current ? "Editor" : "New note"} className="fit:min-h-0">
        <NoteDocument
          key={editorKey}
          note={current}
          onSaved={onSaved}
          onDeleted={onDeleted}
          flushRef={flushRef}
          autoFocus={editorKey > 0}
          className="animate-fade-in fit:min-h-0 fit:flex-1"
        />
      </CardShell>
    </div>
  );
}

/* ------------------------------------------------------------------ Expanded sidebar */

function FilterChip({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] transition focus-visible:outline-2 focus-visible:outline-accent",
        active ? "border-ink bg-ink text-white" : "border-line bg-card text-ink-2 hover:bg-soft",
      )}
    >
      {children}
    </button>
  );
}

function NotesSidebar({
  notes,
  total,
  selected,
  onChoose,
  onCollapse,
  query,
  onQuery,
  filter,
  onFilter,
  usedIcons,
  noLogoCount,
}: {
  notes: NoteView[];
  total: number;
  selected: Selection;
  onChoose: (s: Selection) => void;
  onCollapse: () => void;
  query: string;
  onQuery: (q: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  usedIcons: { icon: NoteIcon; count: number }[];
  noLogoCount: number;
}) {
  const [ref, count] = useFitCount<HTMLUListElement>(64, 8, 8);
  const p = usePaged(notes, count);
  const filtering = query.trim() !== "" || filter !== "all";

  return (
    <CardShell
      icon={<StickyNote />}
      title="Notes"
      className="fit:w-[clamp(260px,26vw,380px)]"
      actions={
        <>
          <Button className="h-8 px-3 text-[13px]" onClick={() => onChoose("new")}>
            <Plus className="size-3.5" /> New
          </Button>
          <IconButton label="Collapse notes list" className="hidden fit:inline-flex" onClick={onCollapse}>
            <PanelLeftClose className="size-4" />
          </IconButton>
        </>
      }
    >
      <label className="relative mb-2 block shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            p.setPage(0);
          }}
          placeholder="Search notes"
          aria-label="Search notes"
          className="h-9 w-full rounded-lg border border-line bg-soft pl-9 pr-3 text-[14px] placeholder:text-faint focus:border-faint focus:bg-card focus:outline-none"
        />
      </label>
      {(usedIcons.length > 0 || filter !== "all") && (
        <div role="group" aria-label="Filter by logo" className="scroll-quiet mb-3 flex shrink-0 gap-1.5 overflow-x-auto pb-0.5">
          <FilterChip active={filter === "all"} label="All notes" onClick={() => { onFilter("all"); p.setPage(0); }}>
            All <span className="tabular opacity-60">{total}</span>
          </FilterChip>
          {usedIcons.map(({ icon, count: n }) => {
            const Icon = NOTE_ICON_COMPONENTS[icon];
            return (
              <FilterChip
                key={icon}
                active={filter === icon}
                label={`Only ${noteIconLabel(icon)} notes`}
                onClick={() => { onFilter(icon); p.setPage(0); }}
              >
                <Icon className="size-3.5" strokeWidth={1.75} /> <span className="tabular opacity-60">{n}</span>
              </FilterChip>
            );
          })}
          {noLogoCount > 0 && (
            <FilterChip active={filter === "none"} label="Notes without a logo" onClick={() => { onFilter("none"); p.setPage(0); }}>
              No logo <span className="tabular opacity-60">{noLogoCount}</span>
            </FilterChip>
          )}
        </div>
      )}
      <ul ref={ref} className="flex flex-col gap-2 overflow-hidden fit:min-h-0 fit:flex-1">
        {notes.length === 0 ? (
          <EmptyState>{filtering ? "No notes match." : "No notes yet."}</EmptyState>
        ) : (
          p.pageItems.map((n) => (
            <li key={n.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onChoose(n.id)}
                aria-current={selected === n.id}
                className={cn(
                  "flex h-16 w-full items-center gap-3 rounded-xl border px-3 text-left transition",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  selected === n.id ? "border-ink bg-soft" : "border-line hover:border-faint",
                )}
              >
                <NoteBadge icon={n.icon} title={n.title} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-ink">{n.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-faint">
                      {n.pinned && <Pin className="size-3 fill-ink text-ink" aria-label="Pinned" />}
                      {n.updatedLabel}
                    </span>
                  </span>
                  <span className="truncate text-[13px] text-muted">{n.preview || "Empty note"}</span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <Pager {...p} noun="notes" />
    </CardShell>
  );
}

/* ------------------------------------------------------------------ Collapsed rail */

function NotesRail({
  notes,
  selected,
  onChoose,
  onExpand,
}: {
  notes: NoteView[];
  selected: Selection;
  onChoose: (s: Selection) => void;
  onExpand: () => void;
}) {
  const [ref, count] = useFitCount<HTMLUListElement>(36, 8, 8);
  const p = usePaged(notes, count);

  return (
    <nav
      aria-label="Notes"
      className="flex w-16 flex-col items-center gap-2 rounded-2xl bg-card px-2 py-4 shadow-card fit:min-h-0"
    >
      <IconButton label="Expand notes list" onClick={onExpand}>
        <PanelLeftOpen className="size-4" />
      </IconButton>
      <IconButton
        label="New note"
        onClick={() => onChoose("new")}
        className={cn(selected === "new" && "border-ink bg-ink text-white hover:bg-ink-2 hover:text-white")}
      >
        <Plus className="size-4" />
      </IconButton>
      <span className="my-1 h-px w-8 shrink-0 bg-line" aria-hidden />
      <ul ref={ref} className="flex w-full flex-col items-center gap-2 overflow-hidden fit:min-h-0 fit:flex-1">
        {p.pageItems.map((n) => (
          <li key={n.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onChoose(n.id)}
              aria-current={selected === n.id}
              aria-label={n.title}
              title={n.title}
              className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <NoteBadge icon={n.icon} title={n.title} active={selected === n.id} className="hover:border-faint" />
            </button>
          </li>
        ))}
      </ul>
      {p.pageCount > 1 && (
        <div className="flex shrink-0 flex-col items-center gap-1">
          <IconButton label="Previous notes" className="size-7" disabled={p.page === 0} onClick={() => p.setPage(p.page - 1)}>
            <ChevronUp className="size-4" />
          </IconButton>
          <span className="text-[11px] text-muted tabular">
            {p.page + 1}/{p.pageCount}
          </span>
          <IconButton
            label="More notes"
            className="size-7"
            disabled={p.page >= p.pageCount - 1}
            onClick={() => p.setPage(p.page + 1)}
          >
            <ChevronDown className="size-4" />
          </IconButton>
        </div>
      )}
    </nav>
  );
}
