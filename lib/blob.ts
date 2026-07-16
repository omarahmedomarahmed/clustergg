import { uid } from "@/lib/utils";

// Resolve a classic Vercel Blob read-write token regardless of the env-var NAME.
// Connecting a store can inject it under a store-prefixed name (not always the
// literal BLOB_READ_WRITE_TOKEN), so we also detect it by its value prefix.
export function resolveBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const v of Object.values(process.env)) {
    if (typeof v === "string" && v.startsWith("vercel_blob_rw_")) return v;
  }
  return undefined;
}

// Blob is usable if we have a classic RW token, a connected store
// (BLOB_STORE_ID), or we're simply running on Vercel where the SDK can
// auto-resolve the connected store via the deployment OIDC token. We attempt
// the upload and fall back gracefully if it fails, so being permissive is safe.
export function blobConfigured(): boolean {
  return !!resolveBlobToken() || !!process.env.BLOB_STORE_ID || !!process.env.VERCEL;
}

type PutOpts = {
  access: "public";
  contentType?: string;
  addRandomSuffix?: boolean;
  token?: string;
};

// Server-side: store a base64 data URL in Vercel Blob and return a short hosted
// URL. Returns null when the input isn't a data URL or the upload fails, so
// callers can fall back to the original value.
export async function uploadDataUrlToBlob(dataUrl: string, scope: string): Promise<string | null> {
  if (!dataUrl?.startsWith("data:image/") || !blobConfigured()) return null;
  const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    const contentType = m[1];
    const ext = contentType.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const buffer = Buffer.from(m[2], "base64");
    const { put } = await import("@vercel/blob");

    // Classic token when present; otherwise pass NO auth and let the SDK
    // auto-resolve the connected store via the deployment's OIDC token — the
    // canonical connected-store flow. (Passing an undefined oidcToken would
    // break that resolution, which is why we don't set it manually.)
    const opts: PutOpts = { access: "public", contentType, addRandomSuffix: false };
    const token = resolveBlobToken();
    if (token) opts.token = token;

    const { url } = await put(`uploads/${scope}/${uid()}.${ext}`, buffer, opts as unknown as Parameters<typeof put>[2]);
    return url;
  } catch {
    return null;
  }
}
