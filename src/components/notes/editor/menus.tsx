"use client";

import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Ban,
  Bold,
  Code,
  Columns3,
  ExternalLink,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pencil,
  Plus,
  Quote,
  Rows3,
  SquareCode,
  Strikethrough,
  Table,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NOTE_HIGHLIGHTS, NOTE_HIGHLIGHT_LABEL, type NoteHighlight } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { IMAGE_ACCEPT } from "./upload";

/** Fired by ⌘K in the editor: the selection toolbar opens its link field. */
export const LINK_EVENT = "fleur:note-link";

const HIGHLIGHT_SWATCH: Record<NoteHighlight, string> = {
  yellow: "bg-hl-yellow",
  green: "bg-hl-green",
  blue: "bg-hl-blue",
  purple: "bg-hl-purple",
  red: "bg-hl-red",
};

const keep = (e: React.MouseEvent) => e.preventDefault(); // don't steal the editor's selection

function MenuButton({
  label,
  active = false,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={keep}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-ink-2 transition hover:bg-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
        active && "bg-soft text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

const Bar = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("flex items-center gap-0.5 rounded-xl border border-line bg-card p-1 shadow-pop", className)}>{children}</div>
);
const Sep = () => <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />;

/** "example.com" → "https://example.com"; keeps mailto:, tel: and relative links. */
function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return v;
  return `https://${v}`;
}

function LinkField({ editor, initial, onDone }: { editor: Editor; initial: string; onDone: () => void }) {
  const [value, setValue] = useState(initial);
  const apply = () => {
    const href = normalizeUrl(value);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href) chain.setLink({ href }).run();
    else chain.unsetLink().run();
    onDone();
  };
  return (
    <form
      className="flex items-center gap-1 pl-1"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <Link2 className="size-3.5 shrink-0 text-muted" aria-hidden />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            editor.commands.focus();
            onDone();
          }
        }}
        placeholder="Paste or type a link"
        aria-label="Link address"
        className="h-7 w-56 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
      />
      <button type="submit" className="h-7 rounded-md bg-ink px-2.5 text-[12px] font-medium text-white transition hover:bg-ink-2">
        {value.trim() ? "Link" : "Remove"}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ Selection toolbar */

/** Floats over selected text: bold, italic, strike, code, link and the five highlight colours. */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
      highlight: e.isActive("highlight") ? ((e.getAttributes("highlight").color as NoteHighlight | undefined) ?? "yellow") : null,
    }),
  });

  useEffect(() => {
    const open = () => !editor.state.selection.empty && setLinking(true);
    window.addEventListener(LINK_EVENT, open);
    return () => window.removeEventListener(LINK_EVENT, open);
  }, [editor]);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="noteSelectionMenu"
      options={{ placement: "top", offset: 8, onHide: () => setLinking(false) }}
      shouldShow={({ editor: e, state, from, to }) => {
        if (!e.isEditable || from === to || state.selection instanceof NodeSelection) return false;
        if (e.isActive("codeBlock")) return false;
        return state.doc.textBetween(from, to, " ").trim().length > 0;
      }}
    >
      <Bar>
        {linking ? (
          <LinkField editor={editor} initial={s.href} onDone={() => setLinking(false)} />
        ) : (
          <>
            <MenuButton label="Bold (⌘B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="size-4" strokeWidth={2.2} />
            </MenuButton>
            <MenuButton label="Italic (⌘I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="size-4" />
            </MenuButton>
            <MenuButton label="Strikethrough" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough className="size-4" />
            </MenuButton>
            <MenuButton label="Code" active={s.code} onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code className="size-4" />
            </MenuButton>
            <MenuButton label="Link (⌘K)" active={s.link} onClick={() => setLinking(true)}>
              <Link2 className="size-4" />
            </MenuButton>
            <Sep />
            {NOTE_HIGHLIGHTS.map((c) => (
              <MenuButton
                key={c}
                label={`${NOTE_HIGHLIGHT_LABEL[c]} highlight`}
                active={s.highlight === c}
                onClick={() =>
                  s.highlight === c
                    ? editor.chain().focus().unsetHighlight().run()
                    : editor.chain().focus().setHighlight({ color: c }).run()
                }
              >
                <span className={cn("size-4 rounded-full ring-1 ring-black/10", HIGHLIGHT_SWATCH[c], s.highlight === c && "ring-2 ring-ink/60")} />
              </MenuButton>
            ))}
            {s.highlight && (
              <MenuButton label="Remove highlight" onClick={() => editor.chain().focus().unsetHighlight().run()}>
                <Ban className="size-4" />
              </MenuButton>
            )}
          </>
        )}
      </Bar>
    </BubbleMenu>
  );
}

/* ------------------------------------------------------------------ Link card (cursor in a link) */

export function LinkMenu({ editor }: { editor: Editor }) {
  const [editing, setEditing] = useState(false);
  const href = useEditorState({ editor, selector: ({ editor: e }) => (e.getAttributes("link").href as string | undefined) ?? "" });
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="noteLinkMenu"
      options={{ placement: "bottom-start", offset: 6, onHide: () => setEditing(false) }}
      shouldShow={({ editor: e, state }) => e.isEditable && state.selection.empty && e.isActive("link")}
    >
      <Bar>
        {editing ? (
          <LinkField editor={editor} initial={href} onDone={() => setEditing(false)} />
        ) : (
          <>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onMouseDown={keep}
              className="flex max-w-64 items-center gap-1.5 truncate rounded-md px-2 py-1 text-[13px] text-accent hover:bg-soft"
              title={`Open ${href}`}
            >
              <ExternalLink className="size-3.5 shrink-0" />
              <span className="truncate">{href.replace(/^https?:\/\//, "")}</span>
            </a>
            <Sep />
            <MenuButton label="Edit link" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </MenuButton>
            <MenuButton label="Remove link" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
              <Link2Off className="size-3.5" />
            </MenuButton>
          </>
        )}
      </Bar>
    </BubbleMenu>
  );
}

/* ------------------------------------------------------------------ Table menu */

export function TableMenu({ editor }: { editor: Editor }) {
  const tableRect = () => {
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    const el = (node instanceof HTMLElement ? node : node.parentElement)?.closest("table");
    return el ? { getBoundingClientRect: () => el.getBoundingClientRect() } : null;
  };
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="noteTableMenu"
      getReferencedVirtualElement={tableRect}
      options={{ placement: "top-start", offset: 8 }}
      shouldShow={({ editor: e }) => e.isEditable && e.isActive("table")}
    >
      <Bar className="text-[12px]">
        <MenuButton label="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()} className="w-auto gap-1 px-1.5">
          <Rows3 className="size-3.5" /> + Row
        </MenuButton>
        <MenuButton label="Add column right" onClick={() => editor.chain().focus().addColumnAfter().run()} className="w-auto gap-1 px-1.5">
          <Columns3 className="size-3.5" /> + Column
        </MenuButton>
        <Sep />
        <MenuButton label="Delete row" onClick={() => editor.chain().focus().deleteRow().run()} className="w-auto px-1.5">
          − Row
        </MenuButton>
        <MenuButton label="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()} className="w-auto px-1.5">
          − Column
        </MenuButton>
        <Sep />
        <MenuButton label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} className="hover:text-down">
          <Trash2 className="size-3.5" />
        </MenuButton>
      </Bar>
    </BubbleMenu>
  );
}

/* ------------------------------------------------------------------ Block handle: + and ⋮⋮ */

type BlockKind = "text" | "h1" | "h2" | "h3" | "bullet" | "numbered" | "task" | "quote" | "code" | "divider" | "table" | "image";

const BLOCKS: { kind: BlockKind; label: string; hint: string; icon: LucideIcon }[] = [
  { kind: "text", label: "Text", hint: "", icon: Type },
  { kind: "h1", label: "Heading 1", hint: "#", icon: Heading1 },
  { kind: "h2", label: "Heading 2", hint: "##", icon: Heading2 },
  { kind: "h3", label: "Heading 3", hint: "###", icon: Heading3 },
  { kind: "bullet", label: "Bulleted list", hint: "-", icon: List },
  { kind: "numbered", label: "Numbered list", hint: "1.", icon: ListOrdered },
  { kind: "task", label: "Checklist", hint: "[]", icon: ListChecks },
  { kind: "quote", label: "Quote", hint: ">", icon: Quote },
  { kind: "code", label: "Code", hint: "```", icon: SquareCode },
  { kind: "divider", label: "Divider", hint: "---", icon: Minus },
  { kind: "table", label: "Table", hint: "", icon: Table },
  { kind: "image", label: "Image", hint: "", icon: ImageIcon },
];

/**
 * Notion's block handle, shown left of the block under the pointer: "+" opens a
 * menu to add a block below (or turn an empty line into one), ⋮⋮ drags the block.
 */
export function BlockHandle({ editor, onImages }: { editor: Editor; onImages: (files: File[], pos: number) => void }) {
  /** The block under the pointer (updated as it moves)… */
  const hovered = useRef<{ node: PMNode; pos: number } | null>(null);
  /** …and the one "+" was clicked next to (the pointer leaves it to reach the menu). */
  const target = useRef<{ node: PMNode; pos: number } | null>(null);
  const imagePos = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Where the menu shows (viewport coordinates), or null when closed. */
  const [open, setOpen] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);

  const setLocked = (locked: boolean) => editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked));
  const close = () => {
    setOpen(null);
    setLocked(false);
  };

  /** Opens below the "+" when there's room, else above it, always inside the window. */
  const openMenu = () => {
    const r = plusRef.current?.getBoundingClientRect();
    if (!r) return;
    // All 12 items (32 px each) without scrolling, when there's room.
    const want = 12 * 32 + 10;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const left = Math.min(r.left, window.innerWidth - 232);
    setOpen(
      below >= Math.min(want, above)
        ? { left, top: r.bottom + 4, maxHeight: Math.min(want, below) }
        : { left, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(want, above) },
    );
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // It's pinned to the window, so it closes when the note scrolls.
    const onScroll = (e: Event) => !menuRef.current?.contains(e.target as Node) && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Where the new block goes: inside an empty paragraph, or a fresh paragraph after the block. */
  const placeCaret = (): number | null => {
    let t = target.current;
    // Fall back to the block the caret is in.
    if (!t) {
      const $from = editor.state.selection.$from;
      if ($from.depth < 1) return null;
      t = { node: $from.node(1), pos: $from.before(1) };
    }
    if (t.node.type.name === "paragraph" && t.node.content.size === 0) return t.pos + 1;
    const end = t.pos + t.node.nodeSize;
    editor.chain().insertContentAt(end, { type: "paragraph" }).run();
    return end + 1;
  };

  const add = (kind: BlockKind) => {
    close();
    const at = placeCaret();
    if (at === null) return;
    const c = editor.chain().focus().setTextSelection(at);
    switch (kind) {
      case "text": c.setParagraph().run(); break;
      case "h1": c.setHeading({ level: 1 }).run(); break;
      case "h2": c.setHeading({ level: 2 }).run(); break;
      case "h3": c.setHeading({ level: 3 }).run(); break;
      case "bullet": c.toggleBulletList().run(); break;
      case "numbered": c.toggleOrderedList().run(); break;
      case "task": c.toggleTaskList().run(); break;
      case "quote": c.toggleBlockquote().run(); break;
      case "code": c.setCodeBlock().run(); break;
      case "divider": c.setHorizontalRule().run(); break;
      case "table": c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case "image":
        c.run();
        imagePos.current = at;
        fileInput.current?.click();
        break;
    }
  };

  return (
    <>
      <DragHandle editor={editor} onNodeChange={({ node, pos }) => (hovered.current = node ? { node, pos } : null)}>
        <div className="relative flex items-center pr-1">
          <button
            ref={plusRef}
            type="button"
            aria-label="Add a block below"
            title="Add a block below"
            aria-haspopup="menu"
            aria-expanded={open !== null}
            onMouseDown={keep}
            onClick={() => {
              target.current = hovered.current;
              setLocked(true);
              openMenu();
            }}
            className="inline-flex size-6 items-center justify-center rounded-md text-faint transition hover:bg-soft hover:text-ink-2"
          >
            <Plus className="size-4" />
          </button>
          <span
            aria-label="Drag to move"
            title="Drag to move · click to select"
            className="inline-flex h-6 w-5 cursor-grab items-center justify-center rounded-md text-faint transition hover:bg-soft hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </span>
          {open &&
            createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Add a block"
              style={{ left: open.left, top: open.top, bottom: open.bottom, maxHeight: open.maxHeight }}
              className="scroll-quiet fixed z-50 w-56 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-pop animate-fade-in"
            >
              {BLOCKS.map((b) => (
                <button
                  key={b.kind}
                  type="button"
                  role="menuitem"
                  onMouseDown={keep}
                  onClick={() => add(b.kind)}
                  className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink transition hover:bg-soft focus-visible:bg-soft focus-visible:outline-none"
                >
                  <span className="inline-flex size-6 items-center justify-center rounded-md border border-line bg-card text-ink-2">
                    <b.icon className="size-3.5" />
                  </span>
                  <span className="flex-1">{b.label}</span>
                  {b.hint && <span className="font-mono text-[11px] text-faint">{b.hint}</span>}
                </button>
              ))}
            </div>,
              document.body,
            )}
        </div>
      </DragHandle>
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        data-note-image-input
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onImages(files, imagePos.current);
        }}
      />
    </>
  );
}
