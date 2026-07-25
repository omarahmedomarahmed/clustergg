import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { canAct, siteUrl } from "@/lib/discord/config";
import { announcingGuilds } from "@/lib/discord/guilds";
import { postMessage } from "@/lib/discord/rest";
import { cardRef, embedColor } from "@/lib/discord/cards";
import { frame, navButton, linkButton, rows } from "@/lib/discord/components";
import { ButtonStyle } from "@/lib/discord/types";
import { challengeUrl } from "@/lib/challenges";

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

// Where should this announcement go? Optionally restricted to one server, which
// is what a private, server-gated challenge needs.
async function targets(onlyGuildId?: string | null): Promise<string[]> {
  const out: string[] = [];
  const fallback = defaultChannel();
  if (fallback && !onlyGuildId) out.push(fallback);
  try {
    const guilds = await announcingGuilds();
    for (const g of guilds) {
      if (onlyGuildId && g.guildId !== onlyGuildId) continue;
      if (g.channelId) out.push(g.channelId);
    }
  } catch { /* fall back to whatever we already have */ }
  return [...new Set(out)];
}

async function announce(payload: Record<string, unknown>, onlyGuildId?: string | null): Promise<void> {
  if (!canAct()) return;
  const channels = await targets(onlyGuildId);
  // Sequential on purpose: a burst of parallel posts is the fastest way to get
  // rate-limited across every server at once.
  for (const channel of channels) {
    try { await postMessage(channel, payload); } catch { /* never break the caller */ }
  }
}

// Nothing to announce into? Then skip the (expensive) card rendering entirely.
async function anyTarget(): Promise<boolean> {
  if (!canAct()) return false;
  return (await targets()).length > 0;
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
      linkButton("See standings", url, "📊"),
    ]),
  });
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
  });
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
  });
}
