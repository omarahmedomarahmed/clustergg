import { PROVIDERS, type ProviderDef } from "@/lib/providers/registry";

// Which games a brand may buy a challenge on. B114.
//
// ===== THE OWNER'S DECISION, ENCODED RATHER THAN REMEMBERED =====
//
// We are on a Riot **development** key. It expires every 24 hours and has to be
// rotated by hand, and a production key has been applied for with no answer.
// Riot's API terms do not permit running a commercial contest on a dev key, so
// the owner's call is: **no Riot game is sold to a brand until a production key
// arrives.**
//
// That decision is correct and it is also the kind of thing a person forgets on
// a Tuesday six weeks from now, while typing a campaign for a brand who asked
// for League. So it is a rule in code with a test behind it, not a note.
//
// ===== WHAT IS AND IS NOT BLOCKED =====
//
// **Blocked:** attaching a paying brand to a challenge on one of these games.
// That is the thing Riot's terms are about — a commercial contest.
//
// **Not blocked:** everything else. Gamers still link Riot accounts, still
// appear on League and VALORANT leaderboards, still enter unsponsored
// challenges, and a server owner may still buy a private challenge for their
// own members. None of that is a brand paying us to run a competition on
// Riot's data, and gutting the game entirely would punish the gamers for a
// paperwork state they did not cause.
//
// ===== WHEN THE KEY ARRIVES =====
//
// Delete the `sponsorBlock` line from the two Riot entries in
// `lib/providers/registry.ts`. Nothing else. That is the whole point of the
// flag living on the provider rather than in a list of game names somewhere:
// there is exactly one place to change, and `tests/db/sponsorable.mts` fails
// loudly if a second list appears.

/** Why a game cannot carry a paying brand right now, or null when it can. */
export function sponsorBlockFor(game: string): string | null {
  const g = (game ?? "").trim().toLowerCase();
  if (!g) return null;
  const hit = PROVIDERS.find((p) => p.game.toLowerCase() === g && p.sponsorBlock);
  return hit?.sponsorBlock ?? null;
}

export const isSponsorable = (game: string): boolean => sponsorBlockFor(game) === null;

/** Every game a brand may currently be sold, from the live provider list. */
export function sponsorableGames(): string[] {
  return Array.from(new Set(
    PROVIDERS.filter((p) => !p.identityOnly && !p.sponsorBlock).map((p) => p.game),
  ));
}

/** Every game currently withheld from brands, with the reason. */
export function blockedGames(): { game: string; why: string }[] {
  const out = new Map<string, string>();
  for (const p of PROVIDERS) if (p.sponsorBlock) out.set(p.game, p.sponsorBlock);
  return [...out].map(([game, why]) => ({ game, why }));
}

export type SponsorCheck = { ok: true } | { ok: false; error: string };

/**
 * May this challenge take a paying brand?
 *
 * Pure, so the same answer reaches the admin form, the action that saves it and
 * the campaign builder without any of them re-deciding. A rule enforced in one
 * of three places is a rule with two ways round it.
 *
 * Returns OK when there is no brand: an unsponsored challenge on a Riot game is
 * fine and is most of what we run there.
 */
export function checkSponsorable(
  game: string,
  brandId: string | null | undefined,
): SponsorCheck {
  if (!brandId) return { ok: true };
  const why = sponsorBlockFor(game);
  if (!why) return { ok: true };
  return {
    ok: false,
    error: `${game} cannot carry a sponsor yet. ${why} Run it unsponsored, or pick another game.`,
  };
}

/** For an admin screen that wants to explain itself before somebody tries. */
export const sponsorBlockNote = (p: ProviderDef): string | null => p.sponsorBlock ?? null;
