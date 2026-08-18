// Serving what the in-process store holds.
//
// Only reachable in the demo backend — a production deployment hands back a
// blob URL and never comes here. It exists so the upload flow is walkable end
// to end without anybody configuring a bucket: the card renderer fetches this
// URL, checks its content type, and either draws the artwork or fences it.
//
// The content type it serves is `StoredImage.contentType`, which `acceptImage`
// has already guaranteed is PNG or JPEG. So this route cannot serve a WebP
// even if one somehow reached the store, and the renderer's one failure mode
// is closed from both ends.

import { NextResponse } from "next/server";
import { readImage } from "../../../../lib/cards/store.ts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const held = readImage(id);
  if (!held) return NextResponse.json({ error: "No such image." }, { status: 404 });

  return new NextResponse(held.bytes as unknown as BodyInit, {
    headers: {
      "content-type": held.contentType,
      // Immutable: the id is minted per upload and the bytes never change.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
