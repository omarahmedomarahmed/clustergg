import { NextRequest, NextResponse } from "next/server";
import { authorizeBotRequest, discordConfigured } from "@/lib/discord/config";
import { registerGlobalCommands } from "@/lib/discord/rest";
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
// Guarded by the same shared-secret pattern as /api/cron/sync, because command
// registration is a global, rate-limited write against our Discord app.
export async function POST(req: NextRequest) {
  if (!authorizeBotRequest(req.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!discordConfigured()) {
    return NextResponse.json({ error: "discord_not_configured" }, { status: 503 });
  }

  const res = await registerGlobalCommands(ALL_COMMANDS);
  clearCatalog();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status || 500 });
  return NextResponse.json({ ok: true, registered: ALL_COMMANDS.map((c) => c.name) });
}
