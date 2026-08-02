import type { CardData } from "@/lib/cards/types";
import type { CardAsset } from "@/lib/cards/layout";

// What a card-sourced placed image should show, for THIS card.
//
// A placed image can be a fixed picture or a SLOT whose contents come from the
// card — this champion's splash, this gamer's avatar, this game's logo. The
// slot is the admin's (frame, size, position); the picture is the card's.
//
// Pure, and deliberately kept out of `render.tsx`: the layout editor draws the
// same slots on its canvas and has to fill them with the same image the
// renderer would, or the canvas is lying. One function, two callers, no way for
// the preview and the PNG to disagree about what lands in the frame.

/**
 * The card's own picture for a source id, or null when it hasn't got one.
 *
 * Null is meaningful: the caller falls back to the slot's fixed URL, and a slot
 * with neither is dropped rather than drawn as an empty rectangle.
 */
export function assetSourceUrl(d: CardData, source: string): string | null {
  const any = d as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const first = <T,>(v: unknown): T | null => (Array.isArray(v) && v.length ? (v[0] as T) : null);
  switch (source) {
    case "self.art":
      // Splash first, then cover, then the background the card resolved — the
      // order runs from "the artwork this card is about" to "at least it's the
      // right art", which is what makes the slot useful on every kind.
      return str(any.artUrl) ?? str(any.coverUrl) ?? str(d.theme?.bgUrl) ?? null;
    case "self.logo":
      return str(any.logoUrl);
    case "self.avatar":
      return str(any.gameAvatarUrl) ?? str(any.avatarUrl);
    case "self.trophy": {
      const t = first<{ imageUrl?: string }>(any.trophies);
      return str(t?.imageUrl);
    }
    default:
      return null;
  }
}

/**
 * The picture one placed image should draw on one card.
 *
 * Empty string means "nothing to draw" — a sourced slot on a card that has no
 * such image and no fallback. Callers skip those.
 */
export function assetPicture(a: Pick<CardAsset, "url" | "source">, d: CardData | null): string {
  if (!a.source || a.source === "fixed") return a.url ?? "";
  if (!d) return a.url ?? "";
  return assetSourceUrl(d, a.source) ?? a.url ?? "";
}
