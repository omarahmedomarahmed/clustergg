import { profileCard, challengeCard, leaderboardCard, weekCard } from "@/lib/cards/data";
import { getOrRenderCard } from "@/lib/cards/cache";
import { previewFixtures } from "@/lib/cards/preview";
import type { CardData } from "@/lib/cards/types";

// A real bot card, on the marketing site. B109.
//
// ===== THE RULE THIS EXISTS TO KEEP =====
//
// B89.6: *"Sections render the real component, not a screenshot. A screenshot
// is a claim; a component is the product."*
//
// It was written down and never built. Every public page describes the bot in
// prose and none of them show one of its cards — which is the one artefact that
// makes the product obviously real in two seconds, and the one thing a
// screenshot in `/public` would quietly stop being true about the day somebody
// changes the layout.
//
// ===== THE THREE THINGS THAT MADE THIS NON-OBVIOUS =====
//
// **1. It must not go through `cardRef`.**
//
// `lib/discord/cards.ts` is the obvious function to reach for and it is the
// wrong one: it picks a sponsor and calls `logCardAdImpression`. That row is
// DELIVERY EVIDENCE — the number we show a brand to prove their challenge
// reached the servers they paid for. Rendering a card on our own homepage
// through that path would pad a brand's delivery with website visitors who were
// never in any Discord server. B107 exists because we bill for challenges
// rather than views; inflating the evidence anyway would be the same dishonesty
// arriving through a side door.
//
// So the marketing card carries NO sponsor and logs NOTHING.
//
// **2. It must not cost a render per visitor.**
//
// `lib/cards/budget.ts` caps renders at 4,000/day for the whole network. A
// public page that drew a card per pageview would eat that ceiling with
// strangers and then serve every gamer in Discord a stale card — the marketing
// page would degrade the product it is marketing.
//
// Two guards. `getOrRenderCard` already returns the hosted Blob URL on a hit,
// so the browser fetches Blob rather than our renderer. And the resolved URL is
// memoised in module memory for a TTL, so a burst of traffic costs one lookup
// rather than one per request.
//
// **3. It must degrade to nothing, never to a broken image.**
//
// No Blob configured, an empty database, a render that failed — every one of
// those returns null and the section simply does not render. A grey box with a
// torn-page icon on the homepage is worse than no section at all.

/**
 * How long a resolved card URL is reused.
 *
 * Long enough that traffic cannot turn into lookups; short enough that a card
 * whose data changed is picked up the same visit somebody would notice. The
 * URL is a cache key, not the image — the PNG behind it is immutable per hash,
 * so a stale URL is a stale card and never a wrong one.
 */
export const MARKETING_CARD_TTL_MS = 10 * 60 * 1000;

export type MarketingCard = { url: string; alt: string };

type Entry = { at: number; value: MarketingCard | null };
const memo = new Map<string, Entry>();

/** Staff changing a layout should not have to wait out the TTL. */
export function clearMarketingCards(): void { memo.clear(); }

/**
 * Which kinds are currently memoised. A test hook, and it earns its place.
 *
 * The negative-caching rule — a null answer is cached for the same TTL — is
 * the difference between a launch-day homepage doing one lookup and doing one
 * per pageview. A regex over this file could not tell `memo.set(...)` from
 * `if (value) memo.set(...)`; asking which keys are present can.
 */
export function marketingCacheKeys(): string[] { return [...memo.keys()]; }

/**
 * The newest challenge a stranger is allowed to see.
 *
 * Ordered newest-first and filtered through `stageOf` in code rather than in
 * SQL, because the stage is derived from four columns and a clock and this file
 * must not hold a second opinion about what "public" means. Ten rows is enough
 * to find one: if the last ten are all drafts, the honest answer is no card.
 */
export async function publicChallengeId(): Promise<string | null> {
  try {
    const { getDb, schema } = await import("@/lib/db");
    const { desc } = await import("drizzle-orm");
    const { stageOf } = await import("@/lib/challenge-stage");
    const db = await getDb();
    const rows = await db.select().from(schema.challenges)
      .orderBy(desc(schema.challenges.startAt)).limit(10);
    return rows.find((c) => stageOf(c) !== "draft")?.id ?? null;
  } catch { return null; }
}

const LOADERS: Record<string, () => Promise<{ data: CardData; key: string; alt: string } | null>> = {
  // A real gamer who actually customised their profile. `previewFixtures`
  // resolves it from the database — nothing here invents a person, because a
  // card of an invented gamer is exactly the screenshot this file replaces.
  profile: async () => {
    const fx = await previewFixtures();
    if (!fx?.slug) return null;
    const data = await profileCard(fx.slug);
    return data ? { data, key: fx.slug, alt: "A Cluster profile card, as the Discord bot posts it" } : null;
  },
  // NOT `previewFixtures().challengeId`, and this is the one real trap in this
  // file. That fixture is `order by start_at desc limit 1` — which on any week
  // where staff have drafted next week's run is a DRAFT. Putting a draft
  // challenge's card on the public homepage publishes an unannounced
  // competition, and after B107 it publishes the name of a brand whose invoice
  // may not have cleared.
  //
  // The fixture for a public page has to be a challenge that is already public.
  // `stageOf` decides that, and it returns "draft" for an unpaid challenge too,
  // which is precisely the second case worth excluding.
  challenge: async () => {
    const id = await publicChallengeId();
    if (!id) return null;
    const data = await challengeCard(id);
    return data ? { data, key: id, alt: "A live sponsored challenge card, as the Discord bot posts it" } : null;
  },
  leaderboard: async () => {
    const fx = await previewFixtures();
    if (!fx?.game) return null;
    const data = await leaderboardCard(fx.game, null);
    return data ? { data, key: fx.game, alt: `The ${fx.game} leaderboard card, as the Discord bot posts it` } : null;
  },
  week: async () => {
    const data = await weekCard();
    return data ? { data, key: "week", alt: "The Profile of the Week card, as the Discord bot posts it" } : null;
  },
};

export const MARKETING_CARD_KINDS = Object.keys(LOADERS);

/**
 * A live card of this kind, or null.
 *
 * Null is a first-class answer and every caller must render nothing for it.
 * The cases that produce it are ordinary: Blob unconfigured in a preview
 * deployment, a database with no challenges yet, a render over the daily
 * ceiling with no previous card to fall back on.
 */
export async function liveCard(kind: string): Promise<MarketingCard | null> {
  const hit = memo.get(kind);
  if (hit && Date.now() - hit.at < MARKETING_CARD_TTL_MS) return hit.value;

  let value: MarketingCard | null = null;
  try {
    const load = LOADERS[kind];
    if (load) {
      const built = await load();
      if (built) {
        // `marketing|` in the cache key, deliberately. It keeps this render
        // separate from the bot's own entry for the same gamer, so the two
        // cannot evict each other and a marketing page can never be the reason
        // somebody's Discord card was re-drawn.
        const render = await getOrRenderCard(kind, `marketing|${built.key}`, built.data);
        if (render?.url) value = { url: render.url, alt: built.alt };
      }
    }
  } catch {
    // Never throws. A marketing page must not 500 because a card would not draw.
    value = null;
  }

  // Negative results are cached too, and for the same TTL. Without that, a
  // platform with no challenges yet would retry the whole lookup on every
  // single pageview — the busiest possible cache miss, on the emptiest possible
  // database, which is exactly launch day.
  memo.set(kind, { at: Date.now(), value });
  return value;
}
