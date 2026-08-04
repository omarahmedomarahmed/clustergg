import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { canAct, siteUrl } from "@/lib/discord/config";
import { announcingGuilds } from "@/lib/discord/guilds";
import { postMessage } from "@/lib/discord/rest";
import { cardRef, embedColor } from "@/lib/discord/cards";
import { frame, navButton, linkButton, rows } from "@/lib/discord/components";
import { ButtonStyle } from "@/lib/discord/types";
import { type PickedAd } from "@/lib/cards/ads";
import { withSponsorRow } from "@/lib/discord/sponsor";
import { challengeUrl, challengeStandings } from "@/lib/challenges";
import { reportToHq } from "@/lib/discord/hq";

// Proactive posts into #ClusterGG.
//
// These fire from ordinary server actions (someone joined a challenge, someone
// hit a quest tier), so they must NEVER be able to break the action that
// triggered them. Every function here swallows its own errors and no-ops when
// the bot isn't configured — an announcement failing is not a reason for a
// challenge join to fail.
//
// Announcements go to every server that has the bot installed with
// announcements enabled — that's the whole point of a distribution channel.
// `DISCORD_DEFAULT_CHANNEL_ID` remains as a testing override for a single
// channel before any server has installed.

function defaultChannel(): string | null {
  return process.env.DISCORD_DEFAULT_CHANNEL_ID || null;
}

// Where should this announcement go? A server-gated challenge needs both sides
// of this: the message carrying the entry key goes ONLY to the server that owns
// it, and the "this exists, come watch" message goes to everyone EXCEPT them.
type Scope = {
  only?: string[] | string | null;
  except?: string[] | string | null;
  /**
   * The sponsor on the card in this announcement, from `cardRef(...).ad`.
   *
   * An announcement is one card fanned out to every server, and the click
   * button under it has to be attributed to the server it was pressed in — so
   * the link is minted per recipient rather than once for the payload.
   */
  sponsor?: PickedAd | null;
  /**
   * Record this fan-out against a challenge.
   *
   * Set on the posts that constitute a challenge's audience, so a brand's
   * reach comes from where messages actually landed rather than from a count
   * of servers taken afterwards.
   */
  ledger?: { challengeId: string; kind: "launch" | "ending" | "result" };
};

const asList = (v: Scope["only"]): string[] =>
  v == null ? [] : Array.isArray(v) ? v.filter(Boolean) : [v];

type Target = { channelId: string; guildId: string | null };

async function targets(scope: Scope = {}): Promise<Target[]> {
  const only = asList(scope.only);
  const except = new Set(asList(scope.except));
  const out: Target[] = [];
  const fallback = defaultChannel();
  if (fallback && !only.length) out.push({ channelId: fallback, guildId: null });
  try {
    const guilds = await announcingGuilds();
    for (const g of guilds) {
      if (only.length && !only.includes(g.guildId)) continue;
      if (except.has(g.guildId)) continue;
      if (g.channelId) out.push({ channelId: g.channelId, guildId: g.guildId });
    }
  } catch { /* fall back to whatever we already have */ }
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.channelId) ? false : (seen.add(t.channelId), true)));
}

/**
 * Post to every target in scope. Returns how many actually landed.
 *
 * The count is not decoration: staff press "send" and are told what happened,
 * and "sent to 0 servers" reported as success is how a person finds out three
 * days later that nobody ever saw it.
 */
/** Record what has landed so far. Idempotent, so calling it repeatedly is free. */
async function checkpoint(scope: Scope, landed: string[]): Promise<void> {
  if (!scope.ledger) return;
  const real = landed.filter((g) => !g.startsWith("channel:"));
  if (!real.length) return;
  try {
    const { recordDeliveries } = await import("@/lib/challenge-delivery");
    await recordDeliveries(scope.ledger.challengeId, real, scope.ledger.kind);
  } catch { /* the ledger already swallows its own errors */ }
}

async function announce(payload: Record<string, unknown>, scope: Scope = {}): Promise<number> {
  if (!canAct()) return 0;
  const list = await targets(scope);
  // Sequential on purpose: a burst of parallel posts is the fastest way to get
  // rate-limited across every server at once.
  const landed: string[] = [];
  // Every N servers, checkpoint the ledger — see the note below `flush`.
  const CHECKPOINT = 10;
  let sinceFlush = 0;
  for (const t of list) {
    try {
      // `postMessage` does NOT throw — the REST layer returns {ok:false} for a
      // 403, a deleted channel or a missing token. Counting a try/catch as
      // success therefore counted every server we merely ATTEMPTED, which is
      // the opposite of what a delivery ledger is for. Check the result.
      const res = await postMessage(t.channelId, withSponsorRow(payload, scope.sponsor, t.guildId));
      // The guild id is what the ledger records; the testing-override channel
      // has none, so it counts as delivered under its own channel id rather
      // than silently reading as "nothing landed".
      if (res.ok) {
        landed.push(t.guildId ?? `channel:${t.channelId}`);
        if (++sinceFlush >= CHECKPOINT) { sinceFlush = 0; await checkpoint(scope, landed); }
      }
    } catch { /* never break the caller */ }
  }

  // Write down where it actually landed, and AWAIT it.
  //
  // This was a floating promise, which is why a brand whose challenge reached
  // seven servers saw zero. Announcements run inside a server action or a cron
  // request; the moment that request returns, the runtime is free to freeze the
  // function and an un-awaited insert never happens. Reach is the number the
  // whole business reports on — it cannot be best-effort. One insert of a
  // handful of rows is not worth saving.
  //
  // It is also written at the END of a sequential fan-out that makes one HTTP
  // round-trip per server. Posting to forty servers takes long enough that a
  // request which returns mid-loop can still be frozen before this runs, and
  // then the messages are visibly in Discord while the ledger says nobody was
  // reached — which is exactly what happened, and is worse than no number at
  // all because it looks like the product lying. `flush` therefore records what
  // has landed SO FAR at intervals, so a cut-off run loses the tail rather than
  // everything. The unique index makes the repeats free.
  await checkpoint(scope, landed);
  return landed.length;
}

// Nothing to announce into? Then skip the (expensive) card rendering entirely.
async function anyTarget(): Promise<boolean> {
  if (!canAct()) return false;
  return (await targets()).length > 0;
}

// Staff broadcast: one message to every server with the bot, or to chosen ones.
// Returns real counts so the admin UI can say what actually happened rather
// than claiming success.
export async function broadcastToGuilds(
  message: string,
  onlyGuildIds?: string[],
): Promise<{ targets: number; sent: number }> {
  if (!canAct()) return { targets: 0, sent: 0 };

  const guilds = await announcingGuilds();
  const wanted = onlyGuildIds?.length
    ? guilds.filter((g) => onlyGuildIds.includes(g.guildId))
    : guilds;
  const channels = wanted.map((g) => g.channelId).filter((c): c is string => !!c);

  let sent = 0;
  for (const channel of channels) {
    try {
      const res = await postMessage(channel, {
        content: message.slice(0, 1900),
        components: rows([linkButton("Open Cluster", siteUrl(), "🚀")]),
      });
      if (res.ok) sent++;
    } catch { /* keep going — one bad server shouldn't stop the rest */ }
  }
  return { targets: channels.length, sent };
}

/**
 * The servers this gamer is actually in.
 *
 * Personal news — "X joined a challenge", "X linked an account", "X hit a
 * tier" — was fanned out to EVERY server running the bot. At three servers
 * that reads as a lively product; at three hundred it is a stranger's name in
 * a channel four hundred times a day, and the bot gets muted, then removed.
 * Nobody in a Fortnite server in Brazil needs to know that somebody they have
 * never met joined a chess challenge.
 *
 * So an announcement about a person goes to the rooms that person is in.
 * Nothing about which challenges they may ENTER changes: a gamer still joins
 * as many challenges as they like, in any server, on one game account.
 */
async function guildsOf(userId: string): Promise<string[]> {
  try {
    const db = await getDb();
    const rows = await db.select({ guildId: schema.discordGuildMembers.guildId })
      .from(schema.discordGuildMembers)
      .where(and(
        eq(schema.discordGuildMembers.userId, userId),
        isNull(schema.discordGuildMembers.leftAt),
      ));
    return [...new Set(rows.map((r) => r.guildId))];
  } catch { return []; }
}

async function slugFor(userId: string): Promise<{ slug: string; name: string } | null> {
  try {
    const db = await getDb();
    const [u] = await db.select({ slug: schema.users.slug, name: schema.users.displayName })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    return u ?? null;
  } catch { return null; }
}

// Someone joined a challenge — the strongest "come do this too" signal we have,
// in the rooms where they are somebody.
export async function announceChallengeJoined(userId: string, challengeId: string): Promise<void> {
  if (!(await anyTarget())) return;
  // Their servers, resolved BEFORE the card is rendered: a gamer with no
  // Discord server has nowhere for this to go, and rendering a PNG to post it
  // nowhere is the expensive half of the work.
  const mine = await guildsOf(userId);
  if (!mine.length) return;
  const [who, card, url] = await Promise.all([
    slugFor(userId), cardRef("challenge", { id: challengeId }), challengeUrl(siteUrl(), challengeId),
  ]);
  if (!who || !card.data || card.data.kind !== "challenge") return;
  await announce({
    content: `**${who.name}** just joined **${card.data.title}**.`,
    embeds: [{ color: embedColor(card.data.theme.accent), image: { url: card.url } }],
    components: rows([
      navButton("Join too", frame("challenge", challengeId), [frame("home")], ButtonStyle.Success, "🏆"),
      navButton("START HERE", frame("planets"), [frame("home")], ButtonStyle.Primary, "🚀"),
      linkButton("See standings", url, "📊"),
    ]),
  }, { only: mine, sponsor: card.ad });
}

// A new challenge is live.
//
// A server-gated one is NOT hidden — it's announced everywhere, because a
// competition other servers can watch but not enter is the best advertising a
// server challenge has. What's restricted is the entry key, and this is the one
// place it's ever delivered: a message to the server the challenge belongs to.
/**
 * Post a challenge to Discord and write down where it landed.
 *
 * Returns the number of servers it reached so a caller can SAY so. It used to
 * return void, which made "announced to 0 servers" and "announced to 40"
 * indistinguishable to staff pressing the button — and the only way anybody
 * found out was a brand asking why their reach was zero.
 *
 * A draft is never announced. That is what makes the approve → edit → publish
 * flow safe: the challenge exists, staff can change every word of it, and
 * nothing has left the building until its status says active.
 */
export async function announceChallengeLaunched(challengeId: string): Promise<number> {
  if (!canAct()) return 0;
  const db = await getDb();
  const [ch] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!ch || ch.status !== "active") return 0;

  const [card, url] = await Promise.all([
    cardRef("challenge", { id: challengeId }),
    challengeUrl(siteUrl(), challengeId),
  ]);
  if (!card.data || card.data.kind !== "challenge") return 0;

  const embeds = [{ color: embedColor(card.data.theme.accent), image: { url: card.url } }];
  // An announcement is the first thing most people ever see from this bot, so
  // it carries the whole path: enter this, or start from the beginning.
  const components = rows([
    navButton("Join now", frame("challenge", challengeId), [frame("home")], ButtonStyle.Success, "🏆"),
    navButton("Link a game account", frame("link", ""), [frame("home")], ButtonStyle.Primary, "🎮"),
    navButton("START HERE", frame("planets"), [frame("home")], ButtonStyle.Secondary, "🚀"),
    linkButton("Details", url, "🔗"),
  ]);

  // Every server this challenge was launched on holds the key. `guildId` is the
  // one it belongs to; `guildIds` is the full set staff have added it to.
  const holders = [...new Set([ch.guildId, ...(ch.guildIds ?? [])].filter((g): g is string => !!g))];

  // A private challenge is announced ONLY in the servers it belongs to.
  //
  // It used to also post a "this exists, come watch" message everywhere else,
  // on the theory that a competition others can watch advertises the server
  // running it. In practice that is an announcement about somebody else's
  // private event in every server on the network — the definition of spam, and
  // the private setting means the opposite of "tell everyone". Public
  // challenges still go everywhere; that is what public means.
  //
  // The check is on visibility alone. A private challenge with no holders is
  // announced nowhere rather than falling through to the public path, because
  // "we couldn't work out who owns it" is not a reason to broadcast it.
  if (ch.visibility === "private") {
    if (!holders.length) return 0;
    const reached = await announce({
      content: [
        `${ch.announceHype ? "@here " : ""}**${ch.title}** is live, and it's yours — this server holds the key.`,
        ch.accessKey
          ? `Entry key: **\`${ch.accessKey}\`** — tap Join now, or enter it on the site.`
          : "Tap Join now to enter.",
      ].join("\n"),
      embeds, components,
    }, { only: holders, sponsor: card.ad, ledger: { challengeId, kind: "launch" } });
    return reached;
  }

  const reached = await announce({ content: `**${ch.title}** is live on **${ch.game}**.`, embeds, components },
    { sponsor: card.ad, ledger: { challengeId, kind: "launch" } });

  // And into HQ's feed for that game, so our own server carries every game's
  // news in its own channel rather than one undifferentiated stream.
  void reportToHq({
    type: "challenge",
    game: ch.game,
    title: `${ch.title} is live`,
    body: `${ch.description || "A new challenge just started."}\n\nEnds ${ch.endAt.toLocaleDateString()}.`,
    url,
  }).catch(() => {});

  return reached;
}

/**
 * "Three days left" — the message that turns a challenge somebody scrolled
 * past into one they enter.
 *
 * A challenge is announced once, on the day it launches, and then competes for
 * attention with everything else in a busy server for two weeks. The reminder
 * is the whole point of running competitions on a schedule: it is a reason to
 * post that is not an advert, it names a deadline, and it says plainly that
 * entering costs nothing because they are playing anyway.
 *
 * Same targeting rules as a launch: public goes everywhere, private stays in
 * the servers that own it, and nothing is sent for a challenge that has ended.
 */
export async function announceChallengeReminder(
  challengeId: string,
  opts: { only?: string[]; manual?: boolean } = {},
): Promise<{ ok: boolean; reason?: string; days?: number }> {
  if (!canAct()) return { ok: false, reason: "bot_not_configured" };
  const db = await getDb();
  const [ch] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!ch) return { ok: false, reason: "unknown_challenge" };
  if (ch.status !== "active") return { ok: false, reason: "not_running" };

  const msLeft = ch.endAt.getTime() - Date.now();
  if (msLeft <= 0) return { ok: false, reason: "already_ended" };
  // Rounded UP: with eleven hours to go, "0 days left" is wrong in the only
  // direction that matters.
  const days = Math.ceil(msLeft / 86400000);
  const hours = Math.ceil(msLeft / 3600000);

  const [card, url] = await Promise.all([
    cardRef("challenge", { id: challengeId }),
    challengeUrl(siteUrl(), challengeId),
  ]);
  if (!card.data || card.data.kind !== "challenge") return { ok: false, reason: "no_card" };

  const left = days > 1 ? `**${days} days left**` : hours > 1 ? `**${hours} hours left**` : "**ending within the hour**";
  const holders = [...new Set([ch.guildId, ...(ch.guildIds ?? [])].filter((g): g is string => !!g))];
  const isPrivate = ch.visibility === "private";
  if (isPrivate && !holders.length) return { ok: false, reason: "private_without_a_server" };

  // Scope: what the caller asked for, narrowed by what the challenge allows. A
  // manual re-send to "all servers" must not leak a private challenge.
  const asked = opts.only?.length ? opts.only : null;
  const only = isPrivate
    ? (asked ? holders.filter((h) => asked.includes(h)) : holders)
    : asked;
  if (isPrivate && !only?.length) return { ok: false, reason: "no_matching_server" };

  const landed = await announce({
    content: [
      `⏳ **${ch.title}** — ${left}.`,
      `You're playing **${ch.game}** anyway. Every match you play counts towards this while it runs, and one account can be entered in every challenge on this game at once — so there is no reason to be in only one.`,
    ].join("\n"),
    embeds: [{ color: embedColor(card.data.theme.accent), image: { url: card.url } }],
    components: rows([
      navButton("Join now", frame("challenge", challengeId), [frame("home")], ButtonStyle.Success, "🏆"),
      navButton("Standings", frame("standings", challengeId), [frame("home")], ButtonStyle.Secondary, "📊"),
      linkButton("Details", url, "🔗"),
    ]),
  }, { only, sponsor: card.ad, ledger: { challengeId, kind: "ending" } });

  // Nothing landed is not success. A server list that matched no server, a bot
  // that can't post in any of their channels — both look identical to the
  // person who pressed the button unless we say so.
  if (!landed) return { ok: false, reason: "reached_nobody", days };
  return { ok: true, days };
}

/**
 * The daily pass: one reminder per running challenge.
 *
 * Deliberately not "every challenge every day at any stage" — a reminder on
 * the day a challenge launched is the same message twice, and the value of a
 * countdown is that it counts down. So the first day is skipped and the last
 * day is always sent.
 */
export async function remindLiveChallenges(): Promise<{ sent: number; skipped: number }> {
  if (!canAct()) return { sent: 0, skipped: 0 };
  let sent = 0, skipped = 0;
  try {
    const db = await getDb();
    const live = await db.select({ id: schema.challenges.id, startAt: schema.challenges.startAt })
      .from(schema.challenges).where(eq(schema.challenges.status, "active"));
    for (const c of live) {
      // Launched today? It was announced today. Two posts about the same
      // challenge in one day is exactly the noise this is meant to avoid.
      if (c.startAt && Date.now() - c.startAt.getTime() < 20 * 3600000) { skipped++; continue; }
      const res = await announceChallengeReminder(c.id);
      if (res.ok) sent++; else skipped++;
    }
  } catch { /* a reminder pass that fails is not worth failing a cron over */ }
  return { sent, skipped };
}

// A challenge finished — the podium, with what each winner actually earned.
export async function announceChallengeEnded(challengeId: string): Promise<void> {
  if (!(await anyTarget())) return;
  const [card, standings, url] = await Promise.all([
    cardRef("challenge", { id: challengeId }),
    challengeStandings(challengeId, 3),
    challengeUrl(siteUrl(), challengeId),
  ]);
  if (!card.data || card.data.kind !== "challenge") return;

  const medals = ["🥇", "🥈", "🥉"];
  const podium = standings.length
    ? standings.map((s, i) => `${medals[i] ?? ""} **${s.displayName}** — ${s.points.toLocaleString()} pts`).join("\n")
    : "No one joined this one.";

  await announce({
    content: `**${card.data.title}** has ended.`,
    embeds: [{
      description: podium,
      color: embedColor(card.data.theme.accent),
      image: { url: card.url },
      footer: { text: "Trophies are in the winners' trophy cases and can be redeemed for real value." },
    }],
    components: rows([linkButton("Final standings", url, "🏆")]),
  }, { sponsor: card.ad, ledger: { challengeId, kind: "result" } });
}

// A gamer reached a new quest tier.
export async function announceQuestTier(userId: string, questKey: string, tierName: string): Promise<void> {
  if (!(await anyTarget())) return;
  const mine = await guildsOf(userId);
  if (!mine.length) return;
  const who = await slugFor(userId);
  if (!who) return;
  const card = await cardRef("quest", { slug: who.slug, quest: questKey });
  await announce({
    content: `**${who.name}** reached **${tierName}**.`,
    embeds: [{ color: embedColor(card.data && "theme" in card.data ? card.data.theme.accent : null), image: { url: card.url } }],
    components: rows([
      navButton("My progress", frame("show", `quest:${questKey}`), [frame("home")], ButtonStyle.Primary, "🗺"),
      linkButton("Play the quest map", `${siteUrl()}/quests/${questKey}`, "🎮"),
    ]),
  }, { only: mine, sponsor: card.ad });
}

// A new game account was linked — a good moment to nudge profile customization,
// because a default profile is the least shareable it will ever be.
export async function announceAccountLinked(userId: string, game: string): Promise<void> {
  if (!(await anyTarget())) return;
  const mine = await guildsOf(userId);
  if (!mine.length) return;
  const who = await slugFor(userId);
  if (!who) return;
  const card = await cardRef("profile", { slug: who.slug });
  await announce({
    content: `**${who.name}** linked a **${game}** account.`,
    embeds: [{ color: embedColor(card.data && "theme" in card.data ? card.data.theme.accent : null), image: { url: card.url } }],
    components: rows([
      linkButton("Customize your profile", `${siteUrl()}/profile`, "✨"),
      navButton("Link yours", frame("link"), [frame("home")], ButtonStyle.Primary, "🔗"),
    ]),
  }, { only: mine, sponsor: card.ad });
}
