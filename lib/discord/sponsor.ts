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

  type Row = { type: number; components: unknown[] };
  const existing = (Array.isArray(payload.components) ? [...(payload.components as Row[])] : [])
    .map((r) => ({ ...r, components: [...(r.components ?? [])] }));
  // `group` is OURS, not Discord's. `rows()` strips it on the way out; this
  // button is appended AFTER rows() has run, so it shipped `"group":"nav"` on
  // every card the bot sent while a sponsor was live. components.ts states the
  // rule in its own comment — an unknown field is a rejected message, and a
  // rejected message is a card that never appears.
  const { group: _group, ...btn } = linkButton(sponsorButtonLabel(ad), url);

  // Discord allows five action rows and rejects the WHOLE message if there are
  // six, so an ad on a full card has to displace something. What it displaces
  // matters now in a way it did not before.
  //
  // This used to pop the LAST row, on the reasoning that rows were built
  // most-important-first and the tail was the cheapest thing to lose. B27 made
  // that false: rows are now ordered by meaning, and the last row is
  // NAVIGATION — Home, Back, More. Popping it left a gamer with twenty-four
  // linked accounts holding a card with no way off it, which is a far worse
  // outcome than a missing ad and was caused by selling one.
  //
  // So, in order of preference: sit in the last row if it has a seat (a link
  // out belongs beside Home anyway); take a new row if there is one; and only
  // if the card is at Discord's absolute ceiling, drop the LAST button of the
  // navigation row — which by B27's ordering is the least important one there
  // (support, then vote), never Home or Back.
  const last = existing[existing.length - 1];
  if (last && last.components.length < 5) {
    last.components.push(btn);
  } else if (existing.length < 5) {
    existing.push({ type: ComponentType.ActionRow, components: [btn] });
  } else if (last) {
    last.components.pop();
    last.components.push(btn);
  }
  return { ...payload, components: existing };
}
