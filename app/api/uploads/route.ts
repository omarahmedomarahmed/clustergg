// `/api/uploads` — the door `acceptImage` was written for.
//
// ===== CONVERT ON UPLOAD. RULE 1 OF THE WebP NOTES =====
//
// The card renderer answers `Unsupported image type: image/webp` and the
// artwork simply does not appear — game art, brand creatives, anything. It is
// live in production on the old platform right now.
//
// The rule is **not** "reject WebP". 11-PORTED is explicit: *"accept whatever
// the uploader gives and store PNG or JPEG. Never trust the source format"* —
// because a brand told their logo is the wrong format will send it anyway, in
// an email, on a Friday.
//
// So this route runs every upload through `acceptImage` and puts only its
// output in the store. There is no path past it: `putImage` takes a
// `StoredImage`, which only `acceptImage` produces.
//
// ===== WHAT IT DOES WITHOUT A CONVERTER =====
//
// `acceptImage` refuses when it is handed something undecodable and no
// converter is configured, and the refusal says so in words. That is the
// honest failure: the alternative is storing a WebP and discovering months
// later that every card carrying it has been rendering blank.

import { NextResponse, type NextRequest } from "next/server";
import { acceptImage, UploadRefused } from "../../../lib/cards/upload.ts";
import { putImage } from "../../../lib/cards/store.ts";
import { uid } from "../../../lib/core/utils.ts";
import { currentGamer } from "../../../lib/auth/current.ts";

export const dynamic = "force-dynamic";

/** 8 MB. A card is 1200×630; anything larger is a mistake, not a photograph. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Signed in, at minimum. An open upload endpoint is a free file host with
  // our name on it, and this one hands back a URL we then render.
  const gamer = await currentGamer();
  if (!gamer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is larger than ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const accepted = await acceptImage({
      bytes,
      contentType: file.type,
      filename: file.name,
    });
    const stored = await putImage(accepted, uid());
    return NextResponse.json({
      url: stored.url,
      // Reported rather than hidden, so an admin looking at a card that went
      // wrong can see whether the source needed converting at all.
      converted: stored.converted,
      sourceType: accepted.sourceType,
    });
  } catch (e) {
    if (e instanceof UploadRefused) {
      return NextResponse.json({ error: e.message }, { status: 415 });
    }
    throw e;
  }
}
