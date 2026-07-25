import { NextRequest, NextResponse } from "next/server";
import { authorizeBotRequest, discordConfigured } from "@/lib/discord/config";
import { registerGlobalCommands, registerGuildCommands } from "@/lib/discord/rest";
import { ALL_COMMANDS } from "@/lib/discord/commands";
import { clearCatalog } from "@/lib/discord/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Push the `/cluster` command definition to Discord. Run once after deploying
// a change to lib/discord/commands.ts:
//
//   curl -X POST https://clustergg.com/api/discord/register \
//        -H "Authorization: Bearer $BOT_API_SECRET"
//
// While testing, add `?guild_id=<your server id>`. Guild-scoped commands appear
// IMMEDIATELY; global ones can take up to an hour to propagate, which makes for
// a miserable feedback loop.
//
// Guarded by the same shared-secret pattern as /api/cron/sync, because command
// registration is a global, rate-limited write against our Discord app.
export async function POST(req: NextRequest) {
  if (!authorizeBotRequest(req.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!discordConfigured()) {
    return NextResponse.json({ error: "discord_not_configured" }, { status: 503 });
  }

  const guildId = req.nextUrl.searchParams.get("guild_id");
  const res = guildId
    ? await registerGuildCommands(guildId, ALL_COMMANDS)
    : await registerGlobalCommands(ALL_COMMANDS);
  clearCatalog();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status || 500 });
  return NextResponse.json({
    ok: true,
    scope: guildId ? `guild:${guildId}` : "global",
    registered: ALL_COMMANDS.map((c) => c.name),
    note: guildId ? "Live immediately in that server." : "Global commands can take up to an hour to appear.",
  });
}
