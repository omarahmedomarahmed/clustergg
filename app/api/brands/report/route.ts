import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { keysMatch, hasPortalSession } from "@/lib/portal-auth";
import { getCampaign } from "@/lib/sponsored-campaigns";
import { brandChallengeReports, campaignReport } from "@/lib/brand-report";
import { pricingConfig } from "@/lib/pricing-live";

export const dynamic = "force-dynamic";

// The campaign report, as a spreadsheet.
//
// A brand's own reporting lives somewhere else — a deck, a quarterly review,
// their agency's dashboard — so the numbers have to be able to leave. CSV
// rather than a PDF for exactly that reason: a PDF is something to look at, a
// CSV is something to put in a model.
//
// Authorised the same way the portal is, and scoped to the campaign's own
// brand: a campaign id is not a credential, so holding one must not be enough
// to read another brand's delivery.
export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign") ?? "";
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!campaignId) return NextResponse.json({ error: "no campaign" }, { status: 400 });

  const campaign = await getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  const db = await getDb();
  const [brand] = await db.select({ id: schema.brands.id, name: schema.brands.name, slug: schema.brands.slug, accessKey: schema.brands.accessKey })
    .from(schema.brands).where(eq(schema.brands.id, campaign.brandId)).limit(1);
  if (!brand) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowed = keysMatch(brand.accessKey, key) || await hasPortalSession("brand", brand.id);
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cfg = await pricingConfig();
  const reports = await brandChallengeReports(brand.id, cfg);
  const report = await campaignReport(campaign, reports, cfg);

  const rows: (string | number)[][] = [
    // "People reached" is gone, and so are "Media value" and "ROAS". The first
    // was a server headcount named as delivery; the other two were that
    // headcount multiplied by a benchmark CPM. A CSV outlives every caveat
    // around it — a column called ROAS ends up in a deck — so the honest column
    // names matter more here than anywhere else on the report.
    ["Week", "Challenge", "Starts", "Ends", "Status", "Servers", "Members in those servers", "Could enter", "Entrants", "Clicks", "Spend", "Cost per 1,000 members", "Cost per entrant"],
  ];
  for (const w of report.weeks) {
    const r = w.report;
    rows.push([
      w.index + 1,
      r?.title ?? "—",
      w.startAt.slice(0, 10),
      w.endAt.slice(0, 10),
      w.status,
      r?.reach.servers ?? 0,
      r?.reach.members ?? 0,
      r?.reach.linked ?? 0,
      r?.entrants ?? 0,
      r?.clicks ?? 0,
      r?.spend ?? 0,
      r?.ecpm ?? 0,
      r?.costPerEntrant ?? 0,
    ]);
  }
  const t = report.totals;
  rows.push([
    "Total", `${campaign.slots} weeks on ${campaign.game}`, "", "", campaign.status,
    t.servers, t.members, "", t.entrants, t.clicks, t.spend, t.ecpm, t.costPerEntrant,
  ]);
  rows.push([]);
  // Say what the numbers are, in the file, because the file travels alone.
  rows.push(["Members in those servers", "the headcount of the servers this landed in — not a view count"]);
  rows.push(["Ad views", "not yet measured — per-view delivery reporting is being built"]);
  rows.push(["Prize money paid to players", t.prizePool]);

  const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
  const name = `${brand.slug ?? brand.id}-${campaign.game.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

function cell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
