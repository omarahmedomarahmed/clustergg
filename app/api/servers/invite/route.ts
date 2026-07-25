import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { recordServerEvent } from "@/lib/server-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The click-through from a gated challenge page to the server that holds its
// key. It redirects to Discord, and on the way records the number a server
// owner cares about most: how many people we actually sent them.
//
// A redirect rather than a plain link, because an <a href> straight to
// discord.gg gives us nothing to count, and counting it in the browser would
// miss everyone who blocks scripts.
export async function GET(req: NextRequest) {
  const guildId = req.nextUrl.searchParams.get("g") ?? "";
  const challengeId = req.nextUrl.searchParams.get("c");
  const site = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const home = () => NextResponse.redirect(new URL("/planets", site));

  if (!guildId) return home();

  const db = await getDb();
  const [guild] = await db.select({ inviteUrl: schema.discordGuilds.inviteUrl })
    .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  if (!guild?.inviteUrl) return home();

  // Only ever redirect to Discord. This URL is public and takes a parameter, so
  // without this check it would be an open redirect.
  let target: URL;
  try { target = new URL(guild.inviteUrl); } catch { return home(); }
  if (!/(^|\.)discord\.(gg|com)$/i.test(target.hostname)) return home();

  void recordServerEvent(guildId, "invite_click", { challengeId }).catch(() => {});
  return NextResponse.redirect(target.toString());
}
