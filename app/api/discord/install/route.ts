import { NextResponse } from "next/server";
import { installUrl, siteUrl } from "@/lib/discord/config";
import { getCurrentUser } from "@/lib/auth";
import { signInstallState } from "@/lib/discord/install-credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A stable, shareable install link that redirects to the real OAuth URL.
//
// This exists so it can be set as the app's **Custom Install Link** in the
// Discord portal (Installation → Install Link → Custom URL). That matters: when
// an app is Public, Discord shows an "Add App" button everywhere, and if that
// button uses Discord's *provided* link there is no redirect_uri — so no
// `guild_id` comes back, and the server never gets #clustergg or its guides.
// Pointing the install link here means every route in, including Discord's own
// button, goes through onboarding.
//
// It is ALSO where attribution is minted (B22). This route is per-request and
// uncacheable, which is exactly what a token identifying one gamer needs — the
// public pages render `installUrl()` with no state precisely because they are
// cached and would otherwise hand the first visitor's token to everybody after
// them. A signed-out click simply carries no state and credits nobody.
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const url = installUrl(user ? signInstallState(user.id) : null);
  if (!url) return NextResponse.redirect(`${siteUrl()}/discord-bot?installed=unavailable`);
  return NextResponse.redirect(url);
}
