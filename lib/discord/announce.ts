import { eq } from "drizzle-orm";
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

async function announce(payload: Record<string, unknown>, scope: Scope = {}): Promise<void> {
  if (!canAct()) return;
  const list = await targets(scope);
  // Sequential on purpose: a burst of parallel posts is the fastest way to get
  // rate-limited across every server at once.
  const landed: string[] = [];
  for (const t of list) {
    try {
      // `postMessage` does NOT throw — the REST layer returns {ok:false} for a
      // 403, a deleted channel or a missing token. Counting a try/catch as
      // success therefore counted every server we merely ATTEMPTED, which is
      // the opposite of what a delivery ledger is for. Check the result.
      const res = await postMessage(t.channelId, withSponsorRow(payload, scope.sponsor, t.guildId));
      if (res.ok && t.guildId) landed.push(t.guildId);
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
  if (scope.ledger && landed.length) {
    try {
      const { recordDeliveries } = await import("@/lib/challenge-delivery");
      await recordDeliveries(scope.ledger.challengeId, landed, scope.ledger.kind);
    } catch { /* the ledger already swallows its own errors */ }
  }
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

async function slugFor(userId: string): Promise<{ slug: string; name: string } | null> {
  try {
    const db = await getDb();
    const [u] = await db.select({ slug: schema.users.slug, name: schema.users.displayName })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    return u ?? null;
  } catch { return null; }
}

// Someone joined a challenge — the strongest "come do this too" signal we have.
export async function announceChallengeJoined(userId: string, challengeId: string): Promise<void> {
  if (!(await anyTarget())) return;
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
  }, { sponsor: card.ad });
}

// A new challenge is live.
//
// A server-gated one is NOT hidden — it's announced everywhere, because a
// competition other servers can watch but not enter is the best advertising a
// server challenge has. What's restricted is the entry key, and this is the one
// place it's ever delivered: a message to the server the challenge belongs to.
export async function announceChallengeLaunched(challengeId: string): Promise<void> {
  if (!canAct()) return;
  const db = await getDb();
  const [ch] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!ch || ch.status !== "active") return;

  const [card, url] = await Promise.all([
    cardRef("challenge", { id: challengeId }),
    challengeUrl(siteUrl(), challengeId),
  ]);
  if (!card.data || card.data.kind !== "challenge") return;

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
  const gated = ch.visibility === "private" && holders.length > 0 && !!ch.accessKey;

  if (gated) {
    await announce({
      content: [
        `${ch.announceHype ? "@here " : ""}**${ch.title}** is live, and it's yours — this server holds the key.`,
        `Entry key: **\`${ch.accessKey}\`** — tap Join now, or enter it on the site.`,
      ].join("\n"),
      embeds, components,
    }, { only: holders, sponsor: card.ad, ledger: { challengeId, kind: "launch" } });

    await announce({
      content: `**${ch.title}** is live on **${ch.game}** — a server challenge. Anyone can follow the standings; entering needs a key from the server running it.`,
      embeds, components,
    }, { except: holders, sponsor: card.ad, ledger: { challengeId, kind: "launch" } });
    return;
  }

  await announce({ content: `**${ch.title}** is live on **${ch.game}**.`, embeds, components },
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
  }, { sponsor: card.ad });
}

// A new game account was linked — a good moment to nudge profile customization,
// because a default profile is the least shareable it will ever be.
export async function announceAccountLinked(userId: string, game: string): Promise<void> {
  if (!(await anyTarget())) return;
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
  }, { sponsor: card.ad });
}
