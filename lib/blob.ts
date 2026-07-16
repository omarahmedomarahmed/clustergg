import { uid } from "@/lib/utils";

// Resolve the Vercel Blob read-write token regardless of the env-var NAME.
// Connecting a Blob store can inject the token under a store-prefixed name
// (not always the literal BLOB_READ_WRITE_TOKEN), so we also detect it by its
// unmistakable value prefix `vercel_blob_rw_`. This makes uploads work even
// when the dashboard named the variable something unexpected.
export function resolveBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const v of Object.values(process.env)) {
    if (typeof v === "string" && v.startsWith("vercel_blob_rw_")) return v;
  }
  return undefined;
}

// Server-side: store a base64 data URL in Vercel Blob and return a short hosted
// URL. Returns null when Blob isn't configured or the input isn't a data URL, so
// callers can fall back to the original value.
export async function uploadDataUrlToBlob(dataUrl: string, scope: string): Promise<string | null> {
  const token = resolveBlobToken();
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
