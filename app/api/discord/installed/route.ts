import { NextRequest, NextResponse, after } from "next/server";
import { discordConfigured, siteUrl } from "@/lib/discord/config";
import { onboardGuild, guildSummary } from "@/lib/discord/onboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where Discord sends the server owner after they add the bot.
//
// This is the trick that removes the need for a gateway connection: the OAuth
// callback carries `guild_id`, which is the only thing install-time onboarding
// actually needs. No websocket, no GUILD_CREATE listener, no always-on process.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const guildId = q.get("guild_id");
  const site = siteUrl();

  if (q.get("error")) {
    return NextResponse.redirect(`${site}/discord-bot?installed=cancelled`);
  }
  if (!guildId || !discordConfigured()) {
    return NextResponse.redirect(`${site}/discord-bot?installed=unavailable`);
  }

  // Creating a channel and pinning ~9 guide PNGs takes longer than a browser
  // redirect should, so the owner lands on the site immediately and the setup
  // finishes behind them.
  // Credit the gamer who brought us this server (B22). Read here, in the
  // request, because `state` lives on the URL and `after` runs without it.
  const state = q.get("state");

  after(async () => {
    try {
      const summary = await guildSummary(guildId);
      await onboardGuild(guildId, summary?.guild.owner_id);
    } catch { /* the owner can re-run /cluster show:admin to retry */ }
    // AFTER onboarding, so the guild row exists and the credit lands on it
    // rather than on a stub. `creditInstall` never throws and never blocks —
    // an install that onboarded and failed to pay is a support ticket; an
    // install that failed because the payment threw is a lost server.
    try {
      const { creditInstall } = await import("@/lib/discord/install-credit");
      await creditInstall(guildId, state);
    } catch { /* non-fatal, by construction */ }
  });

  return NextResponse.redirect(`${site}/discord-bot?installed=1&guild=${encodeURIComponent(guildId)}`);
}
