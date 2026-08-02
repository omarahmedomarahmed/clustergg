import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { awardQuestAction } from "@/lib/quests";
import { BOT_LIST_IDS, BOT_LISTS, botListKeyName, VOTE_ACTION, VOTE_COOLDOWN_HOURS } from "@/lib/botlists";
import { dmUser } from "@/lib/discord/rest";
import { siteUrl } from "@/lib/discord/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where a bot-list vote lands.
//
// Bot-list ranking is votes, and every list that matters lets a person vote for
// a bot every twelve hours. A bot that gives voters nothing gets voted for once
// and never again; a bot that gives them something gets voted for twice a day
// by the same people, forever. That is the entire mechanic, and this is the
// endpoint it runs through.
//
// The reward is Cluster Points, deliberately: the gamer already cares about CP,
// it already has a ledger and a profile card, and the alternative is inventing
// a second currency whose only purpose is to be spent on us.
//
// ===== The two things that make this safe =====
//
// 1. THE SECRET. Anyone can POST to this URL. Each list signs its webhook with
//    a secret we set on its dashboard, sent in `Authorization`. Without the
//    check, this endpoint is "give me CP", typed by anyone, forever.
//
// 2. THE VOTER MUST BE OURS. The list sends a Discord snowflake. Somebody who
//    has never signed in has no Cluster account to credit, and inventing one on
//    the strength of a webhook would let a list's traffic create users. So an
//    unknown voter is ACCEPTED (the list gets its 200 and stops retrying) and
//    simply not credited — with the reason recorded.

type VotePayload = {
  // top.gg
  user?: string;
  bot?: string;
  type?: string;
  isWeekend?: boolean;
  // discordbotlist.com
  id?: string;
  admin?: boolean;
  // botlist.me and others
  userId?: string;
  voter?: { id?: string };
};

const voterIdOf = (b: VotePayload): string =>
  String(b.user ?? b.userId ?? b.id ?? b.voter?.id ?? "").trim();

export async function POST(req: NextRequest, ctx: { params: Promise<{ service: string }> }) {
  const { service } = await ctx.params;
  if (!BOT_LIST_IDS.has(service)) {
    return NextResponse.json({ error: "unknown_list" }, { status: 404 });
  }

  // The webhook secret for this list. Stored beside its API key, because it is
  // the same operational act: paste what the list gave you.
  const content = await getContent([botListKeyName(service), `botlist.${service}.webhook`])
    .catch(() => ({} as Record<string, string>));
  const secret = (content[`botlist.${service}.webhook`] ?? "").trim();
  if (!secret) {
    // Not configured is not the same as rejected, and the difference matters to
    // whoever is setting it up. 503, not 401.
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  if ((req.headers.get("authorization") ?? "") !== secret) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: VotePayload;
  try { payload = (await req.json()) as VotePayload; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const discordId = voterIdOf(payload);
  if (!discordId) return NextResponse.json({ ok: true, credited: false, reason: "no_voter_in_payload" });

  // A test ping from the list's dashboard. Acknowledged, never credited.
  if (payload.type === "test") return NextResponse.json({ ok: true, credited: false, reason: "test" });

  const db = await getDb();
  const [identity] = await db.select({ userId: schema.oauthIdentities.userId })
    .from(schema.oauthIdentities)
    .where(and(
      eq(schema.oauthIdentities.provider, "discord"),
      eq(schema.oauthIdentities.providerUserId, discordId),
    )).limit(1);

  if (!identity) {
    // They voted and we cannot pay them — so tell them how to get paid. This is
    // the highest-intent signup prompt the product has: somebody who just went
    // out of their way to vote for us.
    await dmUser(discordId, {
      embeds: [{
        title: "Thanks for the vote",
        description:
          "You just voted for Cluster — and we owe you Cluster Points for it, but we can't find a Cluster account behind your Discord.\n\n"
          + `Sign in once and every future vote pays: ${siteUrl()}/login\n\n`
          + "You can vote again in twelve hours.",
        color: 0x8b5cf6,
      }],
    }).catch(() => false);
    return NextResponse.json({ ok: true, credited: false, reason: "no_cluster_account" });
  }

  // The award. `awardQuestAction` carries the daily cap and the dedup index, so
  // a list that retries a delivery cannot pay twice.
  const bucket = new Date().toISOString().slice(0, 13);
  await awardQuestAction(db, identity.userId, VOTE_ACTION, {
    refType: `botlist:${service}`,
    // The hour bucket is the dedup key: a list retrying the same delivery lands
    // on the same bucket and is ignored, while a genuine second vote twelve
    // hours later gets its own.
    refId: bucket,
  }).catch(() => {});

  // What ACTUALLY landed, read back from the ledger rather than predicted.
  //
  // The first version of this told the voter a number computed here, which the
  // quest engine then ignored in favour of its own weight — so the DM promised
  // points the profile never showed. A reward is a promise, and the only honest
  // source for it is the row that was written.
  const written = await db.select({ qp: schema.questEvents.qpAwarded })
    .from(schema.questEvents)
    .where(and(
      eq(schema.questEvents.userId, identity.userId),
      eq(schema.questEvents.actionKey, VOTE_ACTION),
      eq(schema.questEvents.refId, bucket),
    ));
  const cp = written.reduce((sum, r) => sum + Number(r.qp ?? 0), 0);

  const list = BOT_LISTS.find((l) => l.id === service);
  await dmUser(discordId, {
    embeds: [{
      title: cp > 0 ? `+${cp} CP — thanks for the vote` : "Thanks for the vote",
      description:
        `Your vote on ${list?.name ?? service} is counted${cp > 0 ? ", and the points are on your profile" : ""}.\n\n`
        + `You can vote again in ${VOTE_COOLDOWN_HOURS} hours.`,
      color: 0x34d399,
    }],
  }).catch(() => false);

  return NextResponse.json({ ok: true, credited: cp > 0, cp });
}

// A GET here is somebody checking the URL works before pasting it into a list's
// dashboard, so answer that question rather than 405ing at them.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ service: string }> }) {
  const { service } = await ctx.params;
  const known = BOT_LIST_IDS.has(service);
  const content = known
    ? await getContent([`botlist.${service}.webhook`]).catch(() => ({} as Record<string, string>))
    : {};
  return NextResponse.json({
    list: service,
    known,
    configured: !!(content[`botlist.${service}.webhook`] ?? "").trim(),
    next: !known
      ? "That isn't a list we know about."
      : (content[`botlist.${service}.webhook`] ?? "").trim()
        ? "Ready. Paste this URL into the list's webhook field and use the same secret."
        : "Set the webhook secret in Admin → Discord → Bot lists first, then paste this URL into the list.",
  });
}
