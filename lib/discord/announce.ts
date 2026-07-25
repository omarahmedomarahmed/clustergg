import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { canAct, siteUrl } from "@/lib/discord/config";
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
// Guild targeting lands with the growth phase (discord_guilds). Until then
// these post to a single default channel if one is configured, which is enough
// to exercise the path end-to-end in a test server.

function defaultChannel(): string | null {
  return process.env.DISCORD_DEFAULT_CHANNEL_ID || null;
}

async function announce(payload: Record<string, unknown>): Promise<void> {
  if (!canAct()) return;
  const channel = defaultChannel();
  if (!channel) return;
  try { await postMessage(channel, payload); } catch { /* never break the caller */ }
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
  if (!canAct() || !defaultChannel()) return;
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
  if (!canAct() || !defaultChannel()) return;
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
  if (!canAct() || !defaultChannel()) return;
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
