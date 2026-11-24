"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { session, user } from "@/db/schema";
import { isTimeZone } from "@/lib/timezones";
import { requireViewer } from "@/lib/viewer";
import { NOT_FOUND, fail, formObject, type ActionResult } from "./result";

const ProfileInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  timezone: z.string().refine(isTimeZone, "Pick a timezone from the list"),
});

/** Name and timezone. Email changes and password resets go through the owner's CLI. */
export async function updateProfile(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer({ allowPendingPassword: true });
  try {
    const data = ProfileInput.parse(formObject(fd));
    await db
      .update(user)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(user.id, v.id));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Signs out one of the viewer's other devices. */
export async function revokeSession(id: string): Promise<ActionResult> {
  const v = await requireViewer({ allowPendingPassword: true });
  try {
    const sessionId = z.string().min(1).max(100).parse(id);
    if (sessionId === v.sessionId) return { ok: false, error: "Use Sign out to end this session." };
    const deleted = await db
      .delete(session)
      .where(and(eq(session.id, sessionId), eq(session.userId, v.id)))
      .returning({ id: session.id });
    if (!deleted.length) return NOT_FOUND;
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Signs out every device except this one. */
export async function revokeOtherSessions(): Promise<ActionResult> {
  const v = await requireViewer({ allowPendingPassword: true });
  try {
    await db.delete(session).where(and(eq(session.userId, v.id), ne(session.id, v.sessionId)));
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
