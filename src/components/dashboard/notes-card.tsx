"use client";

import Link from "next/link";
import { Pin, Plus, StickyNote } from "lucide-react";
import { useState } from "react";
import type { NoteView } from "@/lib/queries/notes";
import { cn } from "@/lib/cn";
import { NoteDialog } from "@/components/forms/note-dialog";
import { NoteBadge } from "@/components/notes/note-badge";
import { EmptyState, IconButton } from "@/components/ui/primitives";
import { useFitCount } from "@/components/ui/use-fit";
import { CardShell, OpenLink } from "./card-shell";

/** Compact notes list for the overview: as many as fit, then a link to the Notes page. */
export function NotesCard({ notes, className }: { notes: NoteView[]; className?: string }) {
  const [editing, setEditing] = useState<NoteView | null>(null);
  const [open, setOpen] = useState(false);
  const [ref, count] = useFitCount<HTMLUListElement>(58, 8, 4);
  const hidden = Math.max(0, notes.length - count);

  const openNote = (n: NoteView | null) => {
    setEditing(n);
    setOpen(true);
  };

  return (
    <CardShell
      icon={<StickyNote />}
      title="Notes"
      className={className}
      actions={
        <>
          <IconButton label="New note" onClick={() => openNote(null)}>
            <Plus className="size-4" />
          </IconButton>
          <OpenLink href="/notes" label="Open Notes" />
        </>
      }
    >
      {notes.length === 0 ? (
        <EmptyState>Write your first note.</EmptyState>
      ) : (
        <ul ref={ref} className="flex flex-col gap-2 overflow-hidden fit:min-h-0 fit:flex-1">
          {notes.slice(0, count).map((n) => (
            <li key={n.id} className="shrink-0">
              <button
                type="button"
                onClick={() => openNote(n)}
                className={cn(
                  "flex h-[58px] w-full items-center gap-3 rounded-xl border px-3 text-left transition",
                  "hover:border-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  n.pinned ? "border-transparent bg-soft" : "border-line bg-card",
                )}
              >
                <NoteBadge icon={n.icon} title={n.title} className="size-8 text-[13px] [&>svg]:size-4" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-ink">{n.title}</span>
                    {n.pinned && <Pin className="size-3 shrink-0 fill-ink text-ink" aria-label="Pinned" />}
                  </span>
                  <span className="truncate text-[12px] text-muted">{n.preview || "Empty note"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <Link href="/notes" className="mt-2 shrink-0 text-[13px] text-muted transition hover:text-ink">
          +{hidden} more →
        </Link>
      )}
      <NoteDialog open={open} onOpenChange={setOpen} note={editing} />
    </CardShell>
  );
}
