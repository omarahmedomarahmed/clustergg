// The gift confirm button's custom_id (B5.2).
//
// Extracted from the interactions route for one reason: Discord caps a
// `custom_id` at **100 characters** and truncates silently. The id carries the
// trophy, the recipient and the optional note, in that order — so a naive
// `.slice(0, 100)` on the whole string clips the NOTE, which is harmless, until
// a long slug pushes the boundary left and it starts clipping the SLUG. At that
// point the confirm button sends a cash-redeemable trophy to a different
// person, or to nobody, and the press that was supposed to make gifting safe is
// the thing that breaks it.
//
// So the note is what gives way, always, and the identifiers are never cut.

export const MAX_CUSTOM_ID = 100;
const PREFIX = "gconf";

/**
 * Build it, dropping the note as far as necessary — never the ids.
 *
 * Returns null when the ids alone cannot fit, which is the honest answer: a
 * button that cannot name its recipient must not be rendered.
 */
export function giftConfirmId(trophyId: string, slug: string, note = ""): string | null {
  const head = `${PREFIX}|${trophyId}|${slug}`;
  if (!trophyId || !slug || head.length > MAX_CUSTOM_ID) return null;
  const room = MAX_CUSTOM_ID - head.length - 1;      // -1 for the separator
  if (room <= 0) return head;
  // A note containing "|" is fine — `parseGiftConfirmId` rejoins everything
  // after the second separator rather than assuming three parts.
  return `${head}|${note.slice(0, room)}`;
}

export function parseGiftConfirmId(customId: string): { trophyId: string; slug: string; note: string } | null {
  const parts = customId.split("|");
  if (parts[0] !== PREFIX) return null;
  const [, trophyId, slug, ...rest] = parts;
  if (!trophyId || !slug) return null;
  return { trophyId, slug, note: rest.join("|") };
}
