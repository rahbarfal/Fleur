import "server-only";
import { desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/db";
import { notes, type NoteIcon } from "@/db/schema";
import { timeAgo, zoned } from "@/lib/dates";
import { markdownToPlain } from "@/lib/markdown-text";
import type { Viewer } from "@/lib/viewer";

export type NoteView = {
  id: number;
  title: string;
  /** Raw markdown. */
  content: string;
  /** Plain-text one-liner for lists. */
  preview: string;
  pinned: boolean;
  /** null = no logo (the badge shows the title's first letter). */
  icon: NoteIcon | null;
  updatedLabel: string;
  ago: string;
};

export async function getNotes(v: Viewer): Promise<NoteView[]> {
  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, v.id))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt));
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    preview: markdownToPlain(n.content),
    pinned: n.pinned,
    icon: n.icon,
    updatedLabel: format(zoned(n.updatedAt, v.tz), "d MMM yyyy"),
    ago: timeAgo(n.updatedAt),
  }));
}
