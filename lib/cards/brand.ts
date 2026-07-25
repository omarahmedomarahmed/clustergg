import { getContent } from "@/lib/cms";

// The two pieces of brand furniture that appear on EVERY card: the astronaut
// mascot and the real Cluster logo mark.
//
// They live in one place so a card can't be rendered without them. The mascot
// is what makes a card recognisable as ours at a glance in a Discord feed —
// that only works if it is on all of them, not most of them.
//
// Both are admin-editable. Dedicated card keys win; otherwise they fall back to
// the mascot and logo the rest of the site already uses, so there is nothing to
// configure for them to appear.

export type BrandArt = { astronautUrl: string | null; markUrl: string | null };

const KEYS = ["card.astronaut", "card.mark", "brand.quest.astronaut.front", "brand.logo"];

let memo: { at: number; value: BrandArt } | null = null;
const TTL = 60_000;

export async function brandCardArt(): Promise<BrandArt> {
  if (memo && Date.now() - memo.at < TTL) return memo.value;
  let value: BrandArt = { astronautUrl: null, markUrl: null };
  try {
    const c = await getContent(KEYS);
    value = {
      astronautUrl: c["card.astronaut"] || c["brand.quest.astronaut.front"] || null,
      markUrl: c["card.mark"] || c["brand.logo"] || null,
    };
  } catch { /* cards still render with the built-in wordmark */ }
  memo = { at: Date.now(), value };
  return value;
}

// Staff changed the mascot or the logo — forget what we memoised.
export function forgetBrandArt(): void {
  memo = null;
}
