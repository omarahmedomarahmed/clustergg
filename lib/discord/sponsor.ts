import { ComponentType } from "@/lib/discord/types";
import { linkButton } from "@/lib/discord/components";
import { siteUrl } from "@/lib/discord/config";
import { sponsorButtonLabel, type PickedAd } from "@/lib/cards/ads";
import { sponsorClickUrl } from "@/lib/cards/ad-click";

// The sponsor's button, under every card the bot posts.
//
// An image inside a Discord message cannot be clicked. That is the single fact
// that shapes this: a brand can buy the top-right corner of every card the bot
// draws and, without a button, can never receive a click from any of it — only
// impressions, forever, with no way to prove the impressions did anything.
//
// So a link button goes under the card. It reads
//
//     Sponsored: <brand> — <the brand's own tagline>
//
// and the "Sponsored:" half is not the brand's to edit: a button in somebody's
// own community that reads like a recommendation FROM that community is how a
// bot gets removed from it. It points at `/api/ads/go`, which counts the click
// against the exact creative that was served, notes the server it came from,
// and forwards to the brand's destination.
//
// One definition, used by interaction replies, by announcements, and by the
// weekly feed — three code paths that all post cards and would otherwise each
// have their own idea of what a sponsor button is.

/** Add the sponsor row to a message payload. Returns it unchanged if unsold. */
export function withSponsorRow<T extends { components?: unknown }>(
  payload: T,
  ad: PickedAd | null | undefined,
  guildId: string | null,
): T {
  if (!ad) return payload;
  const url = sponsorClickUrl(siteUrl(), ad, guildId);
  // A creative with no destination gets no button. A button that goes nowhere
  // is worse for the brand than no button — it reads as broken, under their
  // name, in somebody else's community.
  if (!url) return payload;

  const existing = Array.isArray(payload.components) ? [...(payload.components as unknown[])] : [];
  // Discord allows five action rows per message and rejects the whole message —
  // every button in it — if there are six. The sponsor gets its own row, and a
  // full message drops its LAST row to make space: rows are built
  // most-important-first, so the tail is the cheapest thing to lose.
  if (existing.length >= 5) existing.pop();
  existing.push({
    type: ComponentType.ActionRow,
    components: [linkButton(sponsorButtonLabel(ad), url)],
  });
  return { ...payload, components: existing };
}
