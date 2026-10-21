import { logoDimensionProblem, logoTargetSize } from "@project-flame/lib";

export type PreparedLogo =
  | { ok: true; file: File; width: number; height: number }
  | { ok: false; reason: "decode" | "tooSmall"; width?: number; height?: number };

/**
 * Before uploading a logo: read its real size, refuse it if it's under 400×400, and re-encode it in
 * the browser (WebP, PNG fallback; longest side ≤ 1024). Re-encoding gives the server a clean file
 * whose content always matches its type, whatever the original was (a ".png" that is really a
 * JPEG/WebP, a huge photo, a CMYK JPEG…), which is what made some valid-looking images fail.
 */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await decode(file);
  } catch {
    return { ok: false, reason: "decode" };
  }
  const width = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const height = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  if (logoDimensionProblem(width, height)) return { ok: false, reason: "tooSmall", width, height };

  const target = logoTargetSize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, reason: "decode", width, height };
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  if ("close" in bitmap) bitmap.close();

  const blob = (await toBlob(canvas, "image/webp", 0.9)) ?? (await toBlob(canvas, "image/png"));
  if (!blob) return { ok: false, reason: "decode", width, height };
  const type = blob.type === "image/webp" ? "image/webp" : "image/png";
  const name = `logo.${type === "image/webp" ? "webp" : "png"}`;
  return { ok: true, file: new File([blob], name, { type }), ...target };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, quality));
}
