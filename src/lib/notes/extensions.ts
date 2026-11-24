import type { AnyExtension, MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { NOTE_HIGHLIGHTS, type NoteHighlight } from "@/lib/constants";

/*
 * The note editor's building blocks, shared by the editor (browser) and the
 * Markdown round-trip test (Node). Notes are stored as Markdown: everything here
 * is standard CommonMark/GFM, except highlights, which are inline HTML
 * (<mark data-color="yellow">…</mark>), the one thing Markdown can't express.
 */

const isColor = (c: unknown): c is NoteHighlight => NOTE_HIGHLIGHTS.includes(c as NoteHighlight);
const MARK_RE = new RegExp(`^<mark data-color="(${NOTE_HIGHLIGHTS.join("|")})">([\\s\\S]*?)</mark>`);

/** Highlight in one of the five note colours (styled in CSS via data-color, not inline styles). */
export const NoteHighlightMark = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (el: HTMLElement) => (isColor(el.getAttribute("data-color")) ? el.getAttribute("data-color") : "yellow"),
        renderHTML: (attrs: { color?: string }) => ({ "data-color": isColor(attrs.color) ? attrs.color : "yellow" }),
      },
    };
  },
  renderMarkdown: (node, h) => {
    const color = isColor(node.attrs?.color) ? node.attrs.color : "yellow";
    return `<mark data-color="${color}">${h.renderChildren(node)}</mark>`;
  },
  parseMarkdown: (token, h) => h.applyMark("highlight", h.parseInline(token.tokens || []), { color: token.color ?? "yellow" }),
  markdownTokenizer: {
    name: "highlight",
    level: "inline",
    start: (src: string) => {
      const a = src.indexOf("<mark");
      const b = src.indexOf("==");
      return a === -1 ? b : b === -1 ? a : Math.min(a, b);
    },
    tokenize(src: string, _tokens: MarkdownToken[], h: MarkdownLexerConfiguration): MarkdownToken | undefined {
      const tag = MARK_RE.exec(src);
      if (tag) return { type: "highlight", raw: tag[0], text: tag[2], color: tag[1], tokens: h.inlineTokens(tag[2]) };
      // Plain ==text== (e.g. typed or pasted): a yellow highlight.
      const eq = /^(==)(?!\s)([^=]*[^=\s])(==)/.exec(src);
      if (eq) return { type: "highlight", raw: eq[0], text: eq[2], color: "yellow", tokens: h.inlineTokens(eq[2]) };
      return undefined;
    },
  },
}).configure({ multicolor: true });

export function noteExtensions({ placeholder = true }: { placeholder?: boolean } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Not standard Markdown.
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https" },
      dropcursor: { color: "#3b82f6", width: 2 },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // Column widths can't be stored in Markdown, so columns aren't resizable.
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false, allowBase64: false }),
    NoteHighlightMark,
    ...(placeholder
      ? [
          Placeholder.configure({
            showOnlyCurrent: true,
            placeholder: ({ node }) =>
              node.type.name === "heading" ? `Heading ${node.attrs.level}` : "Write, or press + for blocks. Markdown works: # - [] **",
          }),
        ]
      : []),
    // breaks: a single line break stays a line break, as notes always did.
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
  ];
}
