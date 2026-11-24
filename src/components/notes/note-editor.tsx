"use client";

import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { noteExtensions } from "@/lib/notes/extensions";
import { BlockHandle, LINK_EVENT, LinkMenu, SelectionToolbar, TableMenu } from "./editor/menus";
import { isImageFile, uploadImage } from "./editor/upload";

/*
 * Notion-style note editor: formatting appears as you type (Markdown shortcuts),
 * a toolbar floats over selected text, "+" / ⋮⋮ add and drag blocks, and images
 * can be dropped, pasted or picked. The note itself is read and written as Markdown.
 */

/** Same reading typography the notes always had. */
const PROSE = cn(
  "note-prose prose prose-sm prose-neutral max-w-none text-[15px] leading-relaxed text-ink focus:outline-none",
  "prose-headings:tracking-tight prose-headings:text-ink prose-h1:text-[26px] prose-h1:mb-2 prose-h1:mt-6 prose-h2:text-[20px] prose-h2:mt-5 prose-h2:mb-1.5 prose-h3:text-[16px] prose-h3:mt-4 prose-h3:mb-1",
  "prose-p:my-1 prose-li:my-0 prose-ul:my-1 prose-ol:my-1 [&_li>p]:my-0.5",
  "prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-a:cursor-pointer",
  "prose-code:rounded prose-code:bg-soft prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
  "prose-pre:rounded-xl prose-pre:bg-[#232325] prose-pre:text-[13px]",
  "prose-blockquote:border-l-ink/20 prose-blockquote:font-normal prose-blockquote:text-ink-2 prose-blockquote:not-italic [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none",
  "prose-hr:my-5 prose-hr:border-line prose-img:my-3 prose-table:my-3 prose-table:text-[14px]",
);

/** Whether an image is still uploading (its src is a local blob: URL). Don't save then. */
export function hasPendingUploads(editor: Editor): boolean {
  let pending = false;
  editor.state.doc.descendants((n) => {
    if (n.type.name === "image" && String(n.attrs.src).startsWith("blob:")) pending = true;
    return !pending;
  });
  return pending;
}

function replaceImageSrc(editor: Editor, from: string, to: string | null) {
  if (editor.isDestroyed) return;
  const tr = editor.state.tr;
  // Back to front, so deleting one doesn't shift the next.
  const hits: { pos: number; size: number; attrs: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === "image" && n.attrs.src === from) hits.push({ pos, size: n.nodeSize, attrs: n.attrs });
  });
  for (const h of hits.reverse()) {
    if (to) tr.setNodeMarkup(h.pos, undefined, { ...h.attrs, src: to });
    else tr.delete(h.pos, h.pos + h.size);
  }
  if (hits.length) editor.view.dispatch(tr.setMeta("addToHistory", false));
}

export function NoteEditor({
  initialMarkdown,
  onChange,
  onEditor,
  onError,
  autoFocus = false,
  className,
}: {
  initialMarkdown: string;
  /** Called on every edit (read the Markdown with editor.getMarkdown() when saving). */
  onChange: () => void;
  onEditor?: (editor: Editor | null) => void;
  onError?: (message: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  // useEditor keeps its first options: callbacks go through refs.
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  onChangeRef.current = onChange;
  onErrorRef.current = onError;
  const editorRef = useRef<Editor | null>(null);

  const insertImages = (files: File[], pos?: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const images = files.filter(isImageFile);
    if (!images.length) return onErrorRef.current?.("Only PNG, JPEG, GIF and WebP images can be added.");
    let at = pos ?? editor.state.selection.to;
    for (const file of images) {
      const local = URL.createObjectURL(file);
      editor
        .chain()
        .focus()
        .insertContentAt(at, { type: "image", attrs: { src: local, alt: file.name.replace(/\.[a-z0-9]+$/i, "") } })
        .run();
      at = editor.state.selection.to;
      uploadImage(file)
        .then((url) => replaceImageSrc(editor, local, url))
        .catch((err: Error) => {
          replaceImageSrc(editor, local, null);
          onErrorRef.current?.(err.message);
        })
        // Let the uploaded image load before the local copy goes away.
        .finally(() => setTimeout(() => URL.revokeObjectURL(local), 4000));
    }
  };
  const insertRef = useRef(insertImages);
  insertRef.current = insertImages;

  const extensions = useMemo(() => noteExtensions(), []);
  const editor = useEditor({
    extensions,
    content: initialMarkdown,
    contentType: "markdown",
    // Rendered in the browser only (Next renders the page on the server first).
    immediatelyRender: false,
    // Typing doesn't re-render React; the menus subscribe to just what they show.
    shouldRerenderOnTransaction: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: PROSE, "aria-label": "Note", spellcheck: "true" },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertRef.current(files, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.some(isImageFile)) return false;
        event.preventDefault();
        insertRef.current(files);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          window.dispatchEvent(new Event(LINK_EVENT));
          return true;
        }
        return false;
      },
    },
    onUpdate: () => onChangeRef.current(),
  });

  useEffect(() => {
    editorRef.current = editor;
    onEditor?.(editor);
    return () => onEditor?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className={cn("note-editor relative pl-11", className)}>
      <EditorContent editor={editor} />
      {editor && (
        <>
          <SelectionToolbar editor={editor} />
          <LinkMenu editor={editor} />
          <TableMenu editor={editor} />
          <BlockHandle editor={editor} onImages={(files, pos) => insertImages(files, pos)} />
        </>
      )}
    </div>
  );
}
