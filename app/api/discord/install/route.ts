import { NextResponse } from "next/server";
import { installUrl, siteUrl } from "@/lib/discord/config";

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
export function GET() {
  const url = installUrl();
  if (!url) return NextResponse.redirect(`${siteUrl()}/discord-bot?installed=unavailable`);
  return NextResponse.redirect(url);
}
