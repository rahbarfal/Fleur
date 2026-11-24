import { z } from "zod";
import { parseLocalInput } from "@/lib/dates";

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

export const NOT_FOUND: ActionResult = { ok: false, error: "That item no longer exists. Refresh the page." };

/** Postgres error code, also when wrapped by Drizzle (err.cause). */
function pgCode(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 3; e = e.cause as typeof e, i++) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

export function fail(err: unknown): ActionResult {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  const code = pgCode(err);
  // A referenced wallet/category isn't the viewer's (or was deleted meanwhile).
  if (code === "23503") return { ok: false, error: "That wallet or category doesn't exist. Refresh the page." };
  if (code === "23505") return { ok: false, error: "That name is already taken." };
  console.error(err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** FormData → plain object of strings (checkboxes become "on"). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/** A "yyyy-MM-ddTHH:mm" form value read as wall-clock time in the viewer's timezone. */
export const localDateTime = (tz: string) =>
  z
    .string()
    .min(1, "Date is required")
    .transform((v) => parseLocalInput(v, tz))
    .refine((d) => !Number.isNaN(d.getTime()), "Invalid date");
