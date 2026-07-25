import { NextRequest, NextResponse } from "next/server";
import { postAdsToGuilds, MIN_HOURS_BETWEEN_ADS } from "@/lib/discord/ads";
import { discordConfigured } from "@/lib/discord/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Posts one ad into each server that has unlocked revenue share. Scheduled in
// vercel.json; the per-guild interval in lib/discord/ads.ts is what actually
// controls frequency, so running this more often than needed is harmless.
//
// Same auth as /api/cron/sync — Vercel Cron sends CRON_SECRET automatically.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!discordConfigured()) {
    return NextResponse.json({ ok: true, skipped: "discord_not_configured" });
  }
  const result = await postAdsToGuilds();
  return NextResponse.json({ ok: true, minHoursBetweenAds: MIN_HOURS_BETWEEN_ADS, ...result });
}
