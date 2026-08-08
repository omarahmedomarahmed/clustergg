import { createHash } from "crypto";
import { getDb, schema } from "@/lib/db";
import { serveAds, type ServedCreative } from "@/lib/ads";
import { uid } from "@/lib/utils";
import type { CardAdSlot, CardData } from "@/lib/cards/types";

// The sponsor on a card.
//
// There is no way to buy a banner inside Discord. What there IS, on this
// platform, is a PNG the bot draws every time somebody presses a button — their
// profile, a leaderboard, a challenge, a planet. So the cards are the ad
// inventory, and this module decides which brand appears on the one about to be
// drawn.
//
// Three rules make it a real product rather than a logo in a corner:
//
//   1. **Different brands on adjacent cards.** Creatives are interleaved by
//      brand, so consecutive picks come from different brands whenever more
//      than one is live. A server that opens five cards sees five sponsors, not
//      one repeated five times.
//   2. **Rotation without re-rendering everything.** The pick is a pure
//      function of the card's identity and the current rotation window, so
//      within a window a given card maps to a given creative — the cached PNG
//      is reused — and the next window moves everyone along.
//   3. **Every serve is an impression**, written to the SAME `ad_impressions`
//      table as web placements, with the guild when we know it. Brands read one
//      dashboard, not two.

export const CARD_AD_PLACEMENT = "discord_card";

export type PickedAd = CardAdSlot & {
  campaignCreativeId: string;
  /** Where the button under the card sends people. Null means no button. */
  clickUrl: string | null;
  /** The brand's half of the button label. */
  ctaLabel: string | null;
};

/**
 * What Cluster's own promo says when it is the sponsor on a card.
 *
 * The house creative fills unsold inventory, and unsold inventory is still the
 * best place we have to tell a server owner that their server can earn. Stored
 * as the fallback rather than as a house-brand special case, so an admin can
 * change the wording by giving the house creative its own `ctaLabel`.
 */
export const HOUSE_CTA = "monetize your Discord server";

/**
 * The Discord button under a sponsored card.
 *
 * An image in a Discord message is not a link — there is no click on a card, no
 * matter how good the creative is. A link button underneath it is the only
 * clickable surface Discord gives us, so every card the bot posts carries one
 * for whoever paid for that card.
 *
 * The label is not fully the brand's: it always opens with "Sponsored:" and the
 * brand's name, because a button in a community's own server that reads like a
 * recommendation from that server is exactly the thing that gets a bot removed.
 * Brands write the tagline after it.
 */
export function sponsorButtonLabel(ad: { brandName: string; ctaLabel?: string | null }): string {
  const tagline = (ad.ctaLabel || HOUSE_CTA).trim();
  // Discord hard-caps a button label at 80 characters and rejects the whole
  // message — every button in it — if one is longer.
  return `Sponsored: ${ad.brandName} — ${tagline}`.slice(0, 80);
}

// Stable per-card seed: the same card asks for the same slot in a window, and
// two different cards asked for at the same instant land on different brands.
function seedNumber(seed: string): number {
  return parseInt(createHash("sha1").update(seed).digest("hex").slice(0, 8), 16);
}

/**
 * Round-robin the creatives across brands.
 *
 * Sorting by priority alone puts all of one brand's creatives next to each
 * other, which is exactly the arrangement that makes the network look like it
 * has one advertiser. Taking one creative from each brand in turn means index
 * n and index n+1 are different brands for as long as brands remain.
 */
function interleaveByBrand(list: ServedCreative[]): ServedCreative[] {
  const byBrand = new Map<string, ServedCreative[]>();
  for (const c of list) {
    const key = c.brandName || c.campaignCreativeId;
    const bucket = byBrand.get(key);
    if (bucket) bucket.push(c); else byBrand.set(key, [c]);
  }
  const buckets = [...byBrand.values()];
  const out: ServedCreative[] = [];
  for (let i = 0; out.length < list.length; i++) {
    for (const b of buckets) if (b[i]) out.push(b[i]);
  }
  return out;
}

/** How long one creative holds a given card before the rotation moves on. */
const MIN_ROTATION_SECONDS = 60;

export async function pickCardAd(seed: string, at = Date.now()): Promise<PickedAd | null> {
  try {
    const db = await getDb();
    const placement = await serveAds(db, CARD_AD_PLACEMENT, "both");
    // Video creatives can't be drawn into a PNG. A brand that only uploaded a
    // video isn't shown here rather than shown as a broken box.
    const live = interleaveByBrand((placement?.creatives ?? []).filter((c) => c.fileUrl && c.type !== "video"));
    if (!live.length) return null;

    const window = Math.max(MIN_ROTATION_SECONDS, placement!.rotationIntervalSeconds || 300) * 1000;
    const index = (seedNumber(seed) + Math.floor(at / window)) % live.length;
    const c = live[index];
    return {
      campaignCreativeId: c.campaignCreativeId,
      imageUrl: c.fileUrl,
      brandName: c.brandName,
      clickUrl: c.clickUrl,
      ctaLabel: c.ctaLabel,
    };
  } catch {
    // No ad is always a valid card. Never let the ad system cost a render.
    return null;
  }
}

/**
 * The stand-in shown in the admin layout editor when nothing is sold yet.
 *
 * Positioning an invisible box is guesswork, and the slot is empty on a fresh
 * platform by definition — so the editor always has something to drag. Inline
 * SVG so it costs no network and no storage; the image pipeline transcodes it
 * exactly like a brand's upload.
 */
export const PREVIEW_AD: CardAdSlot = {
  brandName: "Your brand",
  label: "Sponsored",
  imageUrl:
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#2563eb"/>
        </linearGradient></defs>
        <rect width="640" height="200" fill="url(#g)"/>
        <text x="320" y="92" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="34" font-weight="bold">YOUR CREATIVE HERE</text>
        <text x="320" y="132" text-anchor="middle" fill="#e9e9ff" font-family="sans-serif" font-size="20">640 × 200 · every card the bot draws</text>
      </svg>`,
    ).toString("base64"),
};

/**
 * The house creative — what fills the slot when no brand has bought it (B56.0).
 *
 * There is no such thing as an unsold card. The ad box is fixed on every card
 * the bot draws, and a corner that is sometimes empty teaches a server owner
 * that the bot sometimes has one — which is the hardest thing to un-teach, and
 * it is the reason a brand is buying the slot in the first place.
 *
 * Inline SVG, so a platform with no Blob storage and no house campaign still
 * renders a complete card. A real house creative uploaded against the Cluster
 * brand outranks this: `pickCardAd` serves it like any other, and this is only
 * reached when that returns nothing.
 */
export const HOUSE_AD: CardAdSlot = {
  brandName: "Cluster",
  label: "From Cluster",
  imageUrl:
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200">
        <defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/>
        </linearGradient></defs>
        <rect width="640" height="200" fill="#05061c"/>
        <rect width="640" height="200" fill="url(#h)" opacity="0.18"/>
        <text x="36" y="82" fill="#ffffff" font-family="sans-serif" font-size="42" font-weight="bold">Play. Earn. Cash out.</text>
        <text x="36" y="124" fill="#c9c9e6" font-family="sans-serif" font-size="24">Link a game account and get paid to play</text>
        <text x="36" y="166" fill="#22d3ee" font-family="sans-serif" font-size="24" font-weight="bold">clustergg.com</text>
      </svg>`,
    ).toString("base64"),
};

/** The card, with whichever brand this render belongs to attached. */
export async function withCardAd<T extends CardData>(
  data: T,
  seed: string,
): Promise<{ data: T; ad: PickedAd | null }> {
  const ad = await pickCardAd(seed);
  if (!ad) return { data, ad: null };
  return { data: { ...data, theme: { ...data.theme, ad } }, ad };
}

/**
 * One delivery of one creative, into the existing analytics pipeline.
 *
 * Fire-and-forget by design: an impression that fails to write is a number
 * slightly low on a dashboard, while an impression that blocks is a card that
 * arrives late in Discord's 3-second budget.
 */
export function logCardAdImpression(
  campaignCreativeId: string,
  meta: { kind: string; guildId?: string | null; ephemeral?: boolean },
): void {
  void (async () => {
    try {
      const db = await getDb();
      await db.insert(schema.adImpressions).values({
        id: uid(),
        campaignCreativeId,
        pagePath: `discord:card:${meta.kind}`,
        deviceType: "discord",
        guildId: meta.guildId ?? null,
        // B81.2. `surface` is stored and never shown to a brand: knowing which
        // views came from private replies rather than public channels is a step
        // toward inferring WHO saw one in a small server. `cardKind` is shown —
        // it describes the placement, not the person.
        //
        // A card with no guild came from a DM, which is private by definition.
        surface: meta.ephemeral || !meta.guildId ? "discord_private" : "discord_public",
        cardKind: meta.kind,
      });
    } catch { /* analytics must never break a card */ }
  })();
}
