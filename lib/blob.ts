import { uid } from "@/lib/utils";

// Server-side: store a base64 data URL in Vercel Blob and return a short hosted
// URL. Returns null when Blob isn't configured or the input isn't a data URL, so
// callers can fall back to the original value.
export async function uploadDataUrlToBlob(dataUrl: string, scope: string): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !dataUrl?.startsWith("data:image/")) return null;
  const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    const contentType = m[1];
    const ext = contentType.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const buffer = Buffer.from(m[2], "base64");
    const { put } = await import("@vercel/blob");
    const { url } = await put(`uploads/${scope}/${uid()}.${ext}`, buffer, {
      access: "public",
      contentType,
      token,
      addRandomSuffix: false,
    });
    return url;
  } catch {
    return null;
  }
}
