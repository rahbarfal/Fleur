"use client";

import type { Editor } from "@tiptap/core";
import { format } from "date-fns";
import { Check, Loader2, Pin, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { deleteNote } from "@/app/actions/notes";
import type { NoteIcon } from "@/lib/constants";
import { nowIn } from "@/lib/dates";
import { markdownToPlain } from "@/lib/markdown-text";
import type { NoteView } from "@/lib/queries/notes";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/primitives";
import { useViewerTz } from "@/components/ui/viewer-tz";
import { NoteBadge, NoteIconGrid, noteIconLabel } from "./note-badge";
import { NoteEditor, hasPendingUploads } from "./note-editor";
import { useAutosave, type SaveStatus } from "./use-autosave";

/** Drops the empty lines the editor keeps at the end (stored as &nbsp;) and trailing whitespace. */
function cleanMarkdown(md: string): string {
  return md.replace(/(?:\s|&nbsp;|\u00a0)+$/, "");
}

const words = (markdown: string) => {
  const t = markdownToPlain(markdown);
  return t ? t.split(/\s+/).length : 0;
};

/* ------------------------------------------------------------------ Logo picker */

function LogoPicker({ icon, title, onPick }: { icon: NoteIcon | null; title: string; onPick: (icon: NoteIcon | null) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={icon ? `Logo: ${noteIconLabel(icon)}. Change logo` : "Choose a logo"}
        title="Logo"
        onClick={() => setOpen((o) => !o)}
        className="block rounded-lg transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <NoteBadge icon={icon} title={title} className="size-10 text-[16px]" />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose a logo" className="absolute left-0 top-12 z-30 w-[268px] rounded-xl bg-card p-3 shadow-pop animate-fade-in">
          <NoteIconGrid
            value={icon}
            onPick={(i) => {
              onPick(i);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Status */

function StatusText({ status, error, idle }: { status: SaveStatus; error: string | null; idle: string }) {
  if (status === "saving" || status === "pending")
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    );
  if (status === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Check className="size-3" /> Saved
      </span>
    );
  if (status === "error") return <span className="text-down" title={error ?? undefined}>Couldn&apos;t save, retrying…</span>;
  return <span className="text-muted">{idle}</span>;
}

/* ------------------------------------------------------------------ Document */

/**
 * One note: logo, title, and the Notion-style body. Everything autosaves; there's
 * no Save button. Used by the Notes page and the overview's note dialog.
 */
export function NoteDocument({
  note,
  onSaved,
  onDeleted,
  flushRef,
  autoFocus = false,
  fill = false,
  className,
}: {
  /** null = a new note (created once you type something). */
  note: NoteView | null;
  onSaved: (note: NoteView, created: boolean) => void;
  onDeleted: (id: number) => void;
  /** Lets the parent save before switching away or closing. */
  flushRef?: MutableRefObject<(() => Promise<void>) | null>;
  autoFocus?: boolean;
  /** The body always fills its (fixed-height) parent, e.g. in a dialog. */
  fill?: boolean;
  className?: string;
}) {
  const tz = useViewerTz();
  const editorRef = useRef<Editor | null>(null);
  const [title, setTitle] = useState(note?.title ?? "");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [icon, setIcon] = useState<NoteIcon | null>(note?.icon ?? null);
  const [wordCount, setWordCount] = useState(() => words(note?.content ?? ""));
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const latest = useRef({ title, pinned, icon });
  latest.current = { title, pinned, icon };

  const autosave = useAutosave({
    initialId: note?.id ?? null,
    read: () => {
      const e = editorRef.current;
      if (!e || e.isDestroyed || hasPendingUploads(e)) return null;
      return { ...latest.current, content: cleanMarkdown(e.getMarkdown()) };
    },
    onSaved: (id, p) => {
      setWordCount(words(p.content));
      onSaved(
        {
          id,
          title: p.title.trim() || "Untitled",
          content: p.content,
          preview: markdownToPlain(p.content),
          pinned: p.pinned,
          icon: p.icon ?? null,
          updatedLabel: format(nowIn(tz), "d MMM yyyy"),
          ago: "just now",
        },
        !note,
      );
    },
  });
  if (flushRef) flushRef.current = autosave.flush;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const id = autosave.idRef.current;
  const remove = async () => {
    if (!id || !confirm(`Delete "${title.trim() || "Untitled"}"? This can't be undone.`)) return;
    setDeleting(true);
    autosave.cancel();
    const res = await deleteNote(id);
    if (res.ok) onDeleted(id);
    else {
      setDeleting(false);
      setToast(res.error);
    }
  };

  return (
    <div
      className={cn("relative flex flex-col", deleting && "pointer-events-none opacity-50", className)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void autosave.flush();
        }
      }}
    >
      {/* Title and status sit in line with the text; the gutter on the left is for the block handle. */}
      <div className="flex shrink-0 items-center gap-3 pl-11">
        <LogoPicker
          icon={icon}
          title={title}
          onPick={(i) => {
            setIcon(i);
            latest.current.icon = i;
            autosave.saveNow();
          }}
        />
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            autosave.touch();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || (e.key === "ArrowDown" && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
              e.preventDefault();
              editorRef.current?.commands.focus("start");
            }
          }}
          placeholder="Untitled"
          aria-label="Title"
          maxLength={120}
          autoFocus={autoFocus && !note}
          className="min-w-0 flex-1 bg-transparent text-[26px] font-semibold tracking-tight text-ink placeholder:text-faint/70 focus:outline-none"
        />
      </div>
      <div className="mt-1 flex shrink-0 items-center gap-2 pl-11 text-[12px]">
        <StatusText
          status={autosave.status}
          error={autosave.error}
          idle={note ? `Edited ${note.ago}` : "New note · saves as you type"}
        />
        <span className="text-faint">·</span>
        <span className="text-muted tabular">
          {wordCount} word{wordCount === 1 ? "" : "s"}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <IconButton
            label={pinned ? "Unpin" : "Pin to top"}
            aria-pressed={pinned}
            className={cn("size-7", pinned && "border-ink bg-ink text-white hover:bg-ink-2 hover:text-white")}
            onClick={() => {
              setPinned(!pinned);
              latest.current.pinned = !pinned;
              autosave.saveNow();
            }}
          >
            <Pin className={cn("size-3.5", pinned && "fill-white")} />
          </IconButton>
          {id !== null && (
            <IconButton label="Delete note" className="size-7 hover:text-down" onClick={remove}>
              <Trash2 className="size-3.5" />
            </IconButton>
          )}
        </span>
      </div>
      <div className="mb-2 ml-11 mt-3 h-px shrink-0 bg-line" />
      <div className={cn("scroll-quiet overflow-y-auto pt-2", fill ? "min-h-0 flex-1" : "min-h-[50vh] fit:min-h-0 fit:flex-1")}>
        <NoteEditor
          initialMarkdown={note?.content ?? ""}
          onChange={autosave.touch}
          onEditor={(e) => (editorRef.current = e)}
          onError={setToast}
          autoFocus={autoFocus && Boolean(note)}
          className="min-h-full pr-1"
        />
      </div>
      {toast && (
        <p
          role="alert"
          className="absolute bottom-3 left-1/2 z-40 w-max max-w-[90%] -translate-x-1/2 rounded-lg bg-[#232325] px-3 py-1.5 text-[12px] text-white shadow-pop"
        >
          {toast}
        </p>
      )}
    </div>
  );
}
