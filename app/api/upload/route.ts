import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { uploadDataUrlToBlob } from "@/lib/blob";

export const dynamic = "force-dynamic";

// Hard cap on an uploaded image data URL (~8MB string ≈ 6MB image). Blocks
// storage abuse / memory DoS; the client also downscales before sending.
const MAX_DATAURL_BYTES = 8 * 1024 * 1024;

// Accepts a client-downscaled image (data URL) and, when Vercel Blob is
// configured, stores it and returns a short hosted URL — so the DB/HTML never
// inline megabytes of base64. Auth-gated to signed-in users; admin scopes gated
// to staff; size-limited; and only image data URLs or https links are accepted.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let dataUrl = "";
  let scope = "misc";
  try {
    const body = await req.json();
    dataUrl = String(body?.dataUrl ?? "");
    scope = String(body?.scope ?? "misc").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "misc";
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Admin/staff scopes (game logos, covers, etc.) require staff.
  if (["game", "trophy", "partner", "creative", "content", "quest"].includes(scope) && !isStaff(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (dataUrl.length > MAX_DATAURL_BYTES) {
    return NextResponse.json({ error: "image too large (max ~6MB)" }, { status: 413 });
  }

  if (!dataUrl.startsWith("data:image/")) {
    // Escape hatch: allow pasting an already-hosted https image link only.
    // Never echo arbitrary strings (they'd be stored + rendered as img src).
    if (/^https:\/\/[^\s"'<>]{1,2000}$/i.test(dataUrl)) {
      return NextResponse.json({ url: dataUrl, hosted: false });
    }
    return NextResponse.json({ error: "invalid image" }, { status: 400 });
  }

  const hosted = await uploadDataUrlToBlob(dataUrl, scope);
  // Fall back to the data URL when Blob isn't configured or upload failed.
  return NextResponse.json({ url: hosted ?? dataUrl, hosted: !!hosted });
}
