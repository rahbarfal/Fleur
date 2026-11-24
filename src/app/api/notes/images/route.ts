import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { noteImages } from "@/db/schema";
import { DEMO_MAX_NOTE_IMAGES } from "@/lib/demo/demo";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Vercel accepts request bodies up to 4.5 MB; the browser shrinks images well below this first. */
const MAX_BYTES = 4 * 1024 * 1024;

/** File signatures, so only real images are stored (the declared type alone can lie). */
function sniff(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Same-site requests only (the session cookie is SameSite=Lax, this is a second check). */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.BETTER_AUTH_URL) allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
  return allowed.has(origin);
}

/** Upload an image for a note: multipart field "file". Returns { id, url }. */
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v || v.mustChangePassword) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (v.isDemo && (await db.$count(noteImages, eq(noteImages.userId, v.id))) >= DEMO_MAX_NOTE_IMAGES) {
    return NextResponse.json({ error: `The demo allows ${DEMO_MAX_NOTE_IMAGES} images.` }, { status: 403 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "That upload didn't come through. Try again." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "No image in the upload." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large (max 4 MB)." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return NextResponse.json({ error: "Only PNG, JPEG, GIF and WebP images can be added." }, { status: 415 });

  const [row] = await db
    .insert(noteImages)
    .values({ userId: v.id, mime, bytes, size: bytes.length })
    .returning({ id: noteImages.id });
  return NextResponse.json({ id: row.id, url: `/api/notes/images/${row.id}` }, { status: 201 });
}
