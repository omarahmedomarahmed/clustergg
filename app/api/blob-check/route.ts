import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TEMPORARY diagnostic: reports which Blob/OIDC env signals are present (NAMES +
// booleans only — never values) and runs real test uploads so we can see the
// exact auth error on the live deployment. Gated by ?probe=clustergg. Remove
// once Blob uploads are confirmed working.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("probe") !== "clustergg") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const env = process.env;
  const tiny = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const body = Buffer.from(tiny, "base64");
  const attempts: { mode: string; ok: boolean; url?: string; error?: string }[] = [];

  const tryPut = async (mode: string, opts: Record<string, unknown>) => {
    try {
      const { put } = await import("@vercel/blob");
      const { url } = await put(`uploads/probe/${mode}-${Date.now()}.png`, body, opts as unknown as Parameters<typeof put>[2]);
      attempts.push({ mode, ok: true, url });
    } catch (e) {
      attempts.push({ mode, ok: false, error: String(e).slice(0, 400) });
    }
  };

  // A) SDK auto-resolve (connected-store OIDC), no explicit auth.
  await tryPut("auto", { access: "public", contentType: "image/png", addRandomSuffix: false });
  // B) explicit OIDC token + store id, if present.
  if (env.VERCEL_OIDC_TOKEN && env.BLOB_STORE_ID) {
    await tryPut("oidc", { access: "public", contentType: "image/png", oidcToken: env.VERCEL_OIDC_TOKEN, storeId: env.BLOB_STORE_ID });
  }
  // C) classic rw token, if present.
  const rw = env.BLOB_READ_WRITE_TOKEN || Object.values(env).find((v) => typeof v === "string" && v.startsWith("vercel_blob_rw_"));
  if (rw) await tryPut("token", { access: "public", contentType: "image/png", token: rw });

  return NextResponse.json({
    vercel: !!env.VERCEL,
    vercelEnv: env.VERCEL_ENV ?? null,
    hasBlobReadWriteToken: !!env.BLOB_READ_WRITE_TOKEN,
    rwTokenFoundByValue: Object.values(env).some((v) => typeof v === "string" && v.startsWith("vercel_blob_rw_")),
    hasBlobStoreId: !!env.BLOB_STORE_ID,
    hasVercelOidcToken: !!env.VERCEL_OIDC_TOKEN,
    oidcTokenLength: env.VERCEL_OIDC_TOKEN ? env.VERCEL_OIDC_TOKEN.length : 0,
    envNamesBlobOidc: Object.keys(env).filter((k) => /BLOB|OIDC/i.test(k)).sort(),
    attempts,
  });
}
