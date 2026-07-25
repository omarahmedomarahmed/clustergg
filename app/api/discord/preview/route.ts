import { NextRequest, NextResponse } from "next/server";
import { authorizeBotRequest } from "@/lib/discord/config";
import { renderScreen, loadCtx } from "@/lib/discord/screens";
import { frame } from "@/lib/discord/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "What will the bot actually show?" — without needing Discord.
//
// Returns the exact embed + component payload a screen would produce, so staff
// can check a guide, a card or a button label before it goes out to hundreds of
// servers, and so the bot can be verified end-to-end before credentials exist.
//
//   curl -H "Authorization: Bearer $BOT_API_SECRET" \
//     "https://clustergg.com/api/discord/preview?screen=home&discord_id=123"
export async function GET(req: NextRequest) {
  if (!authorizeBotRequest(req.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const screen = q.get("screen") || "home";
  const args = (q.get("args") || "").split(",").filter(Boolean);
  const discordId = q.get("discord_id") || "";

  const ctx = await loadCtx(discordId, q.get("name") || "Preview", q.get("guild_id") || undefined);
  const payload = await renderScreen(frame(screen, ...args), screen === "home" ? [] : [frame("home")], ctx);
  return NextResponse.json({ linked: !!ctx.gamer, screen, args, payload });
}
