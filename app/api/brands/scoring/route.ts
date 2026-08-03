import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { keysMatch, hasPortalSession } from "@/lib/portal-auth";
import { brandGamerScoring } from "@/lib/brand-challenge-detail";

export const dynamic = "force-dynamic";

// How one gamer earned their points in one sponsored challenge.
//
// Fetched on click rather than rendered for the whole field: a week can be four
// hundred entrants with a scoring event each per sync, and nobody opens four
// hundred of them.
//
// Two gates, not one. The brand key proves who is asking, and
// `brandGamerScoring` re-checks that the challenge is theirs — a brand may
// hold a valid key and still name somebody else's challenge id.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brandId = String(sp.get("brand") ?? "");
  const key = String(sp.get("key") ?? "");
  const challengeId = String(sp.get("challenge") ?? "");
  const userId = String(sp.get("gamer") ?? "");

  const db = await getDb();
  const [brand] = await db.select({ accessKey: schema.brands.accessKey })
    .from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The key is not the only proof. A brand that unlocked through the key FORM —
  // or through a shared `?key=` link, which hands off to the unlock route and
  // comes back with a CLEAN url — holds a portal session and no key at all. So
  // every call from that page returned 401 while the server actions on the same
  // page accepted them. Both credentials are accepted, exactly as
  // /api/brands/upload already does.
  const allowed = keysMatch(brand.accessKey, key) || await hasPortalSession("brand", brandId);
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await brandGamerScoring(brandId, challengeId, userId);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data);
}
