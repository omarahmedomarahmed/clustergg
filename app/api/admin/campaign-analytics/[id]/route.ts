import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getCampaignAnalytics, getCampaignReadiness } from "@/lib/brands";

export const dynamic = "force-dynamic";

// Admin/staff-gated JSON endpoint so the campaign page can refresh its analytics
// table in place (ajax) without a full page reload.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isStaff(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const db = await getDb();
  const [analytics, readiness] = await Promise.all([
    getCampaignAnalytics(db, id, 30),
    getCampaignReadiness(db, id),
  ]);
  return NextResponse.json({
    impressions: analytics.impressions,
    clicks: analytics.clicks,
    ctr: analytics.ctr,
    filled: readiness.filled,
    total: readiness.total,
    byPlacement: analytics.byPlacement,
    updatedAt: Date.now(),
  });
}
