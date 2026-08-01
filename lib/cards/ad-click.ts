import { signPayload, verifyPayload } from "@/lib/portal-auth";

// The click-through under a sponsored card.
//
// Discord's link buttons open a URL and tell us nothing — no interaction is
// delivered, so there is no server-side event to count. The only way to know a
// brand got a click is for the button to point at US first: this module mints
// that URL, `/api/ads/go` logs the click and forwards to wherever the brand
// actually wanted people to land.
//
// The link is signed. The ids in it are readable by anyone who presses the
// button, which is fine; what the signature prevents is somebody composing
// their own `/api/ads/go?cc=<a competitor's id>` and running that brand's
// click count — and their cost-per-click — through the floor.

export const AD_CLICK_PATH = "/api/ads/go";

function payload(campaignCreativeId: string, guildId: string | null): string {
  return `${campaignCreativeId}|${guildId ?? ""}`;
}

/** The URL a sponsor button points at. Null when the creative has no target. */
export function sponsorClickUrl(
  siteUrl: string,
  ad: { campaignCreativeId: string; clickUrl?: string | null },
  guildId: string | null,
): string | null {
  if (!ad.clickUrl || !safeTarget(ad.clickUrl)) return null;
  const q = new URLSearchParams({
    cc: ad.campaignCreativeId,
    s: signPayload(payload(ad.campaignCreativeId, guildId)),
  });
  if (guildId) q.set("g", guildId);
  return `${siteUrl.replace(/\/$/, "")}${AD_CLICK_PATH}?${q}`;
}

/** Does this token actually belong to this campaign-creative and server? */
export function verifyClick(campaignCreativeId: string, guildId: string | null, signature: string | null): boolean {
  return verifyPayload(payload(campaignCreativeId, guildId), signature);
}

/**
 * Only http(s), and only somewhere that isn't a script.
 *
 * A brand types their own destination into the portal, so it is untrusted
 * input that we then hand to every member of every server as a button. A
 * `javascript:` URL in a Discord button is rejected by Discord, but a redirect
 * to one from our own domain carries our name on it.
 *
 * A leading `/` is accepted and resolved against our own site: Cluster's house
 * creatives point at `/signup` and `/pricing`, and the whole reason the house
 * ad exists is to fill unsold inventory with something a server owner can act
 * on. Rejecting our own paths would have left every unsold card buttonless.
 */
export function safeTarget(url: string | null | undefined, base?: string): string | null {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return null;
  const absolute = trimmed.startsWith("/")
    ? `${(base ?? siteBase()).replace(/\/$/, "")}${trimmed}`
    : trimmed;
  if (!/^https?:\/\/[^\s<>"']+$/i.test(absolute)) return null;
  try {
    const parsed = new URL(absolute);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch { return null; }
}

// Read here rather than imported, so this module stays free of the Discord
// config and can be used from anywhere (the web click route included).
function siteBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.OAUTH_BASE_URL || "https://clustergg.com").replace(/\/+$/, "");
}
