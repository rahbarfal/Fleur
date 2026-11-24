"use server";

import { revalidatePath } from "next/cache";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { NOTE_ICONS, noteImages, notes } from "@/db/schema";
import { requireViewer } from "@/lib/viewer";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";

/** Longest note (Markdown characters). */
const MAX_CONTENT = 100_000;

const NoteInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  // Autosave can run before a title is typed.
  title: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || "Untitled"),
  content: z.string().max(MAX_CONTENT, "This note is too long to save. Split it into two notes.").default(""),
  pinned: z.string().optional().transform((v) => v === "on"),
  // Absent = leave the logo as it is (e.g. the overview's note dialog); "none" = remove it.
  icon: z
    .union([z.enum(NOTE_ICONS), z.literal("none")])
    .optional()
    .transform((v) => (v === "none" ? null : v)),
});

/**
 * Deletes the viewer's note images that no note links to any more, a day after upload
 * (so undoing a deleted image, or an image still being placed, keeps working).
 */
async function sweepImages(userId: string) {
  await db
    .delete(noteImages)
    .where(
      and(
        eq(noteImages.userId, userId),
        lt(noteImages.createdAt, sql`now() - interval '1 day'`),
        sql`not exists (select 1 from ${notes} n where n.user_id = ${userId} and strpos(n.content, '/api/notes/images/' || ${noteImages.id}::text) > 0)`,
      ),
    );
}

/**
 * Creates or updates a note (the Notes page autosaves through this). It doesn't
 * re-render the page: the editor keeps its own copy, and other pages load fresh.
 */
export async function saveNote(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const raw = formObject(fd);
    const { id, ...data } = NoteInput.parse({ ...raw, id: raw.id || undefined });
    const updatedAt = new Date();
    let savedId = id;
    if (id) {
      const updated = await db
        .update(notes)
        .set({ ...data, updatedAt })
        .where(and(eq(notes.id, id), eq(notes.userId, v.id)))
        .returning({ id: notes.id });
      if (!updated.length) return NOT_FOUND;
    } else {
      const [row] = await db
        .insert(notes)
        .values({ ...data, userId: v.id, updatedAt, createdAt: updatedAt })
        .returning({ id: notes.id });
      savedId = row.id;
    }
    await sweepImages(v.id);
    return { ok: true, id: savedId };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleNotePin(id: number, pinned: boolean): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const updated = await db
      .update(notes)
      .set({ pinned: z.boolean().parse(pinned) })
      .where(and(eq(notes.id, z.number().int().parse(id)), eq(notes.userId, v.id)))
      .returning({ id: notes.id });
    if (!updated.length) return NOT_FOUND;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteNote(id: number): Promise<ActionResult> {
  const v = await requireViewer();
  try {
    const deleted = await db
      .delete(notes)
      .where(and(eq(notes.id, z.number().int().parse(id)), eq(notes.userId, v.id)))
      .returning({ id: notes.id });
    if (!deleted.length) return NOT_FOUND;
    await sweepImages(v.id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
