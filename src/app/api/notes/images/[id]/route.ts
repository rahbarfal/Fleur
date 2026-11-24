import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { noteImages } from "@/db/schema";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A note image, for its owner only (anyone else gets 404). Images never change, so browsers keep them. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getViewer();
  if (!v || !UUID.test(id)) return new NextResponse(null, { status: 404 });
  const [img] = await db
    .select({ mime: noteImages.mime, bytes: noteImages.bytes })
    .from(noteImages)
    .where(and(eq(noteImages.id, id), eq(noteImages.userId, v.id)))
    .limit(1);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
