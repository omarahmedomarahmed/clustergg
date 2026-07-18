// Bake a zoom/pan frame INTO an image (client-side canvas), so the stored image
// already reflects the zoom — every place that renders it just shows the
// enlarged crop, no per-renderer adjust params needed. This is what makes the
// zoom "actually work" for logos, icons, planet art, favicons, etc.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // allow canvas export for CORS-enabled hosts
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// zoom: 1..N (1 = cover-fit). x/y: 0..100 percent (50 = centered), matching CSS
// background-position semantics. Output is a PNG data URL at outW×outH.
export async function bakeFrame(
  src: string,
  { zoom, x, y, outW, outH }: { zoom: number; x: number; y: number; outW: number; outH: number },
): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  const base = Math.max(outW / img.width, outH / img.height); // cover fit
  const scale = base * Math.max(1, zoom);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (outW - dw) * (x / 100);
  const dy = (outH - dh) * (y / 100);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
  try {
    return canvas.toDataURL("image/png", 0.92);
  } catch {
    // Tainted canvas (non-CORS host) — keep the original rather than throwing.
    return src;
  }
}
