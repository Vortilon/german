/**
 * Resize + JPEG for storing notebook previews in localStorage without blowing quota.
 * Falls back to original data URL if bitmap decode fails (e.g. some HEIC).
 */
export async function compressImageToJpegDataUrl(
  file: File,
  maxW = 640,
  quality = 0.72,
): Promise<string | null> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, maxW / img.width);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    img.close();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    });
  }
}
