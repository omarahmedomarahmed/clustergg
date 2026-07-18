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
  cacheControlMaxAge?: number;
};

// Every uploaded asset gets a unique, content-stable URL (uid path, no random
// suffix), so it's safe to cache it in the browser essentially forever. This is
// what stops art re-downloading on every visit and draining data transfer.
const ONE_YEAR = 60 * 60 * 24 * 365;

// Server-side: store a base64 data URL in Vercel Blob and return a short hosted
// URL. Returns null when the input isn't a data URL or the upload fails, so
// callers can fall back to the original value.
export async function uploadDataUrlToBlob(dataUrl: string, scope: string): Promise<string | null> {
  if (!dataUrl?.startsWith("data:image/") || !blobConfigured()) return null;

  let contentType: string;
  let ext: string;
  let buffer: Buffer;
  const b64 = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl);
  if (b64) {
    contentType = b64[1];
    ext = contentType.split("/")[1].replace("+xml", "").replace("jpeg", "jpg").replace("svg", "svg");
    buffer = Buffer.from(b64[2], "base64");
  } else {
    // Non-base64 (utf8 / percent-encoded) SVG data URLs, e.g. the house ads.
    const svg = /^data:(image\/svg\+xml)[^,]*,(.*)$/is.exec(dataUrl);
    if (!svg) return null;
    contentType = "image/svg+xml";
    ext = "svg";
    let payload = svg[2];
    try { payload = decodeURIComponent(payload); } catch { /* already decoded */ }
    buffer = Buffer.from(payload, "utf8");
  }

  return putBuffer(buffer, contentType, ext, scope);
}

// Low-level: store a raw buffer in Vercel Blob and return a short hosted URL, or
// null on failure / when Blob isn't configured.
export async function putBuffer(buffer: Buffer, contentType: string, ext: string, scope: string): Promise<string | null> {
  if (!blobConfigured()) return null;
  try {
    const { put } = await import("@vercel/blob");
    // Classic token when present; otherwise pass NO auth and let the SDK
    // auto-resolve the connected store via the deployment's OIDC token — the
    // canonical connected-store flow.
    const opts: PutOpts = { access: "public", contentType, addRandomSuffix: false, cacheControlMaxAge: ONE_YEAR };
    const token = resolveBlobToken();
    if (token) opts.token = token;
    const { url } = await put(`uploads/${scope}/${uid()}.${ext}`, buffer, opts as unknown as Parameters<typeof put>[2]);
    return url;
  } catch {
    return null;
  }
}

const OUR_BLOB_HOST = /\.public\.blob\.vercel-storage\.com/i;

// Re-host an EXTERNAL image URL (e.g. a Higgsfield cloudfront link) into our own
// Vercel Blob so we serve it from our storage. Returns the new URL, or the
// original when it's already ours / not fetchable / Blob isn't configured.
export async function uploadUrlToBlob(url: string, scope: string): Promise<string> {
  if (!url || !/^https:\/\//i.test(url) || OUR_BLOB_HOST.test(url) || !blobConfigured()) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const contentType = (res.headers.get("content-type") || "image/png").split(";")[0];
    if (!contentType.startsWith("image/")) return url;
    const ext = contentType.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const buffer = Buffer.from(await res.arrayBuffer());
    const hosted = await putBuffer(buffer, contentType, ext, scope);
    return hosted ?? url;
  } catch {
    return url;
  }
}

// Sanitize a JSON-ish object's string values in place: any `data:image/...`
// value is uploaded to Blob and replaced with a short URL. Used to keep the
// profile-builder `theme` blob from carrying megabytes of base64 into the DB.
export async function rehostDataUrlsInObject(obj: Record<string, unknown>, scope: string): Promise<boolean> {
  let changed = false;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.startsWith("data:image/")) {
      const hosted = await uploadDataUrlToBlob(v, scope);
      if (hosted) { obj[k] = hosted; changed = true; }
    }
  }
  return changed;
}
