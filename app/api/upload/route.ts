import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { uid } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Accepts a client-downscaled image (data URL) and, when Vercel Blob is
// configured (BLOB_READ_WRITE_TOKEN), stores it and returns a short hosted URL
// — so the DB/HTML never inline megabytes of base64. Without a token it echoes
// the data URL back (works, just heavier). Auth-gated to signed-in users.
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
  if (["game", "trophy", "partner", "creative", "content"].includes(scope) && !isStaff(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!dataUrl.startsWith("data:image/")) {
    // Already a hosted URL — pass through unchanged.
    return NextResponse.json({ url: dataUrl, hosted: false });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // No blob store configured — fall back to the data URL.
    return NextResponse.json({ url: dataUrl, hosted: false });
  }

  try {
    const match = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(dataUrl);
    if (!match) return NextResponse.json({ url: dataUrl, hosted: false });
    const contentType = match[1];
    const ext = contentType.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const buffer = Buffer.from(match[2], "base64");
    const { put } = await import("@vercel/blob");
    const { url } = await put(`uploads/${scope}/${uid()}.${ext}`, buffer, {
      access: "public",
      contentType,
      token,
      addRandomSuffix: false,
    });
    return NextResponse.json({ url, hosted: true });
  } catch {
    // Any blob failure → safe fallback so the user's upload still saves.
    return NextResponse.json({ url: dataUrl, hosted: false });
  }
}
