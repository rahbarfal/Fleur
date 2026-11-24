import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveExtensions } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { NOTE_HIGHLIGHTS } from "@/lib/constants";
import { noteExtensions } from "./extensions";

/*
 * Notes are stored as Markdown and edited as rich text: Markdown → editor → Markdown
 * must keep everything (and settle after one pass, so autosave doesn't keep rewriting).
 */

const mm = new MarkdownManager({
  extensions: resolveExtensions(noteExtensions({ placeholder: false })),
  markedOptions: { gfm: true, breaks: true },
});
const roundTrip = (md: string) => mm.serialize(mm.parse(md));

/** Already in the editor's own style: must come back unchanged. */
const STABLE: Record<string, string> = {
  headings: "# One\n\n## Two\n\n### Three",
  marks: "**bold** *italic* ~~strike~~ `code`",
  link: "See [the docs](https://example.com/a?b=1) now",
  "bullet + nested": "- one\n- two\n  - nested",
  numbered: "1. first\n2. second",
  tasks: "- [ ] todo\n- [x] done",
  quote: "> quoted text",
  "code block": "```\nconst a = 1;\n```",
  divider: "above\n\n---\n\nbelow",
  image: "![photo](/api/notes/images/6f1c2a3b-0000-4000-8000-000000000000)",
  "line break": "first line  \nsecond line",
  ...Object.fromEntries(NOTE_HIGHLIGHTS.map((c) => [`highlight ${c}`, `a <mark data-color="${c}">marked **bold**</mark> word`])),
};

for (const [name, md] of Object.entries(STABLE)) {
  test(`round-trips ${name}`, () => assert.equal(roundTrip(md), md));
}

test("tables keep their cells", () => {
  const out = roundTrip("| A | B |\n| --- | --- |\n| 1 | 2 |");
  assert.match(out, /\|\s*A\s*\|\s*B\s*\|/);
  assert.match(out, /\|\s*1\s*\|\s*2\s*\|/);
  assert.equal(roundTrip(out), out);
});

test("older notes: single newlines stay line breaks, _italic_ and ==highlight== are normalised", () => {
  assert.equal(roundTrip("Line one\nline two"), "Line one  \nline two");
  assert.equal(roundTrip("_soft_"), "*soft*");
  assert.equal(roundTrip("a ==hi== b"), 'a <mark data-color="yellow">hi</mark> b');
});

test("a colour outside the five isn't invented", () => {
  // Only the five colours are recognised; anything else stays as the text the user wrote.
  const out = roundTrip('<mark data-color="black">x</mark>');
  assert.doesNotMatch(out, /data-color="black"[^]*data-color/);
  assert.equal(roundTrip(out), out);
});

test("every output settles after one pass", () => {
  const all = Object.values(STABLE).join("\n\n");
  const once = roundTrip(all);
  assert.equal(roundTrip(once), once);
});
