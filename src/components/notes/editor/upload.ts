"use client";

/*
 * Images in notes: the browser shrinks big photos (≤ 2000 px, JPEG) before
 * uploading them to /api/notes/images, so uploads stay small and fast.
 */

const MAX_SIDE = 2000;
/** Files already this small (and not too big in pixels) are uploaded as they are. */
const KEEP_BELOW = 1_500_000;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const IMAGE_ACCEPT = ACCEPTED.join(",");

export function isImageFile(f: File): boolean {
  return ACCEPTED.includes(f.type);
}

async function shrink(file: File): Promise<Blob> {
  // GIFs may be animated: keep them as they are.
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_BELOW) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency: put transparent PNGs on white.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return blob && blob.size < file.size ? blob : file;
}

/** Shrinks (when needed) and uploads an image; resolves to its URL or throws a readable error. */
export async function uploadImage(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error("Only PNG, JPEG, GIF and WebP images can be added.");
  const body = new FormData();
  const blob = await shrink(file);
  body.set("file", blob, file.name);
  let res: Response;
  try {
    res = await fetch("/api/notes/images", { method: "POST", body });
  } catch {
    throw new Error("Couldn't upload the image. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't upload the image.");
  return data.url;
}
