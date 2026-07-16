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

// Blob is usable in either auth mode:
//  1. Classic: a read-write token (vercel_blob_rw_…).
//  2. Newer connected-store OIDC: BLOB_STORE_ID + the deployment's
//     VERCEL_OIDC_TOKEN (auto-present on Vercel when a store is connected).
export function blobConfigured(): boolean {
  return !!resolveBlobToken() || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);
}

type PutOpts = {
  access: "public";
  contentType?: string;
  addRandomSuffix?: boolean;
  token?: string;
  oidcToken?: string;
  storeId?: string;
};

// Server-side: store a base64 data URL in Vercel Blob and return a short hosted
// URL. Returns null when Blob isn't configured or the input isn't a data URL, so
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

    const opts: PutOpts = { access: "public", contentType, addRandomSuffix: false };
    const token = resolveBlobToken();
    if (token) {
      opts.token = token;
    } else {
      // Tokenless connected store — authenticate with the deployment OIDC token.
      opts.oidcToken = process.env.VERCEL_OIDC_TOKEN;
      opts.storeId = process.env.BLOB_STORE_ID;
    }

    const { url } = await put(`uploads/${scope}/${uid()}.${ext}`, buffer, opts as unknown as Parameters<typeof put>[2]);
    return url;
  } catch {
    return null;
  }
}
