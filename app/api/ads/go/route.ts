import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { verifyClick, safeTarget } from "@/lib/cards/ad-click";
import { siteUrl } from "@/lib/discord/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Where a sponsor button in Discord actually goes.
//
// An image inside a Discord message is not a link, so the card itself can never
// be clicked. Every card the bot posts carries a link button underneath it, and
// every one of those buttons comes here first: we count the click against the
// campaign-creative that was served, note which server it came from, and then
// send the person on to the brand's own destination.
//
// Two things this deliberately does NOT do:
//
//   * It does not fail closed on a database error. A brand whose analytics row
//     didn't write still gets the visitor; the alternative is an error page
//     with their name on it in somebody's community.
//   * It does not redirect anywhere the brand didn't configure. The target is
//     re-read from the database rather than taken from the query string, so
//     this can never be turned into an open redirect pointed at our domain.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const cc = q.get("cc") ?? "";
  const guildId = q.get("g");
  const home = siteUrl();

  if (!cc || !verifyClick(cc, guildId, q.get("s"))) {
    return NextResponse.redirect(home, { status: 302 });
  }

  let target: string | null = null;
  try {
    const db = await getDb();
    const [row] = await db
      .select({ clickUrl: schema.adCreatives.clickUrl })
      .from(schema.adCampaignCreatives)
      .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
      .where(eq(schema.adCampaignCreatives.id, cc))
      .limit(1);
    target = safeTarget(row?.clickUrl);

    // Counted whether or not the creative still has a destination: the person
    // pressed the brand's button, and that is the number the brand is buying.
    await db.insert(schema.adClicks).values({
      id: uid(),
      campaignCreativeId: cc,
      guildId: guildId ?? null,
      source: guildId ? "discord" : "web",
    });
  } catch { /* the visitor still gets where they were going */ }

  return NextResponse.redirect(target ?? home, { status: 302 });
}
