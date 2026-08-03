import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { keysMatch, hasPortalSession } from "@/lib/portal-auth";
import { getBrandAnalytics } from "@/lib/brands";

export const dynamic = "force-dynamic";

// Key-gated analytics for the brand portal so its chart + placement table can
// refresh in place (ajax) without a page reload. Validates the brand access key,
// mirroring /api/brands/upload.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brandId = String(sp.get("brand") ?? "");
  const key = String(sp.get("key") ?? "");
  const campaignId = sp.get("campaign") || undefined;
  const days = Math.max(1, Math.min(365, Number(sp.get("days")) || 90));

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
  const data = await getBrandAnalytics(db, brandId, { campaignId, days });
  return NextResponse.json({ ...data, updatedAt: Date.now() });
}
