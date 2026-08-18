// Proving a Riot account belongs to the person linking it.
//
// The problem this solves: `adapter.verify()` asks Riot whether "Faker#KR1"
// exists. It does. That is not the same as the person typing it being Faker,
// and on a platform paying prize money the difference is the whole game.
//
// Riot's own answer is RSO — real OAuth — and RSO needs a PRODUCTION key with
// an approved product registration. We hold a PERSONAL key. So we use the
// method every third-party League site uses and that Riot's developer policy
// explicitly contemplates: ask the gamer to set their in-game profile icon to
// one we name, then read it back from summoner-v4.
//
// Why it holds: only someone logged into that account can change its icon, the
// icon we pick is random per attempt, and the window is short. Someone watching
// can't pre-empt it and can't reuse it.
//
// Why it works on the key we have: `/lol/summoner/v4/summoners/by-puuid` and
// `/riot/account/v1/accounts/by-riot-id` are both on the approved 39 (see
// `lib/providers/riot-methods.ts`) — which is what lets VALORANT ride along:
// one Riot account has ONE puuid across League and VALORANT, so an icon proven
// in League proves the same human in VALORANT. That matters more than it
// sounds, because the personal key has no `val/*` methods AT ALL. Riot ID
// identity is not a shortcut here, it is the only route.
//
// One thing this file used to get wrong: it said we had a DEVELOPMENT key, and
// the health note below told an operator whose League had stopped working to
// regenerate it because dev keys expire after 24 hours. Personal keys do not
// expire. Sending someone to regenerate a key that has not expired is how a
// real outage gets misdiagnosed, so the note now says what is true of ours.

import { isApprovedRiotPath, riotPathShape } from "./riot-methods.ts";

const RIOT_TIMEOUT_MS = 8000;

/**
 * Icons every account owns.
 *
 * Ids 0–28 are the starter icons granted to every summoner, so the challenge is
 * always completable — picking a rare icon would fail people who don't own it.
 */
const STARTER_ICONS = Array.from({ length: 29 }, (_, i) => i);

export const PROOF_WINDOW_MIN = 15;

export type IconChallenge = { iconId: number; expiresAt: string };

/** A fresh icon to prove with, avoiding the one currently set. */
export function newIconChallenge(currentIconId?: number | null): IconChallenge {
  const options = STARTER_ICONS.filter((i) => i !== currentIconId);
  const iconId = options[Math.floor(Math.random() * options.length)];
  return { iconId, expiresAt: new Date(Date.now() + PROOF_WINDOW_MIN * 60_000).toISOString() };
}

/** Where the icon's art lives, so the challenge can SHOW the icon to set. */
export function iconImageUrl(iconId: number, version = "14.24.1"): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

async function riot<T>(url: string): Promise<T> {
  const key = process.env.RIOT_API_KEY;
  if (!key) throw new Error("RIOT_API_KEY not configured");

  // ===== THE APPROVED LIST IS CONSULTED, NOT MERELY KEPT =====
  //
  // `riot-methods.ts` is *"the authority"* on the 39 paths this personal key
  // can call (11-PORTED). It was written down, diffed path by path against
  // Riot's own list, and then read by nothing — so a call to an unapproved
  // path would have gone out and come back 403, which looks exactly like an
  // expired key and sends whoever is debugging it to regenerate one that has
  // not expired (10 §4).
  //
  // §0.1's shape: something proven to exist, nothing proven to read it. So the
  // check is here, at the one function every Riot call in this module goes
  // through, rather than at each call site.
  const shape = riotPathShape(url);
  if (!isApprovedRiotPath(shape)) {
    throw new Error(
      `${shape} is not one of the paths this Riot key can call. ` +
        `The approved set is in lib/providers/riot-methods.ts — this is a 403 ` +
        `waiting to happen, not an expired key.`,
    );
  }

  const res = await fetch(url, {
    headers: { "X-Riot-Token": key, "User-Agent": "ClusterGG/1.0 (clustergg.com account verification)" },
    signal: AbortSignal.timeout(RIOT_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Riot HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** The profile icon currently set on an account, by PUUID. */
export async function currentIconId(puuid: string, platform = "euw1"): Promise<number | null> {
  try {
    const s = await riot<{ profileIconId?: number }>(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
    );
    return typeof s?.profileIconId === "number" ? s.profileIconId : null;
  } catch { return null; }
}

export type IconCheck =
  | { ok: true }
  | { ok: false; error: string; seen?: number | null };

/**
 * Has the gamer set the icon we asked for?
 *
 * Riot caches summoner responses for a couple of minutes, so a gamer who
 * changes the icon and presses Verify immediately can legitimately fail. The
 * error says so rather than accusing them.
 */
export async function checkIconProof(
  puuid: string,
  wantIconId: number,
  platform = "euw1",
): Promise<IconCheck> {
  if (!process.env.RIOT_API_KEY) {
    return { ok: false, error: "Riot verification isn't configured yet (RIOT_API_KEY)." };
  }
  const seen = await currentIconId(puuid, platform);
  if (seen === null) return { ok: false, error: "Couldn't read that account from Riot just now. Try again in a minute." };
  if (seen === wantIconId) return { ok: true };
  return {
    ok: false, seen,
    error: `Your profile icon still reads as #${seen}. Riot caches this for a minute or two — set the icon we showed, wait a moment, then press Verify again.`,
  };
}

/**
 * Does this Riot key work, and for what?
 *
 * When a key stops answering, every Riot link and every Riot sync fails with a
 * 403 that nothing else surfaces. This is the probe behind the admin health
 * panel, so "why is League broken" has an answer.
 *
 * `production` is deliberately a probe for something we are NOT approved for.
 * It calls a `val/*` method, which the personal key cannot reach, so on a
 * healthy production system it reads FALSE — and that is the correct, expected
 * answer, not a fault. It flips true only if Riot grants the production key,
 * which is the one thing an admin panel can't otherwise tell us. It used to be
 * labelled "VALORANT stats", which made a normal day look like an outage.
 */
export async function riotKeyHealth(platform = "euw1"): Promise<{
  configured: boolean;
  account: boolean;
  summoner: boolean;
  production: boolean;
  note: string;
}> {
  const configured = !!process.env.RIOT_API_KEY;
  if (!configured) {
    return { configured, account: false, summoner: false, production: false, note: "RIOT_API_KEY is not set." };
  }
  const region = platform.startsWith("na") ? "americas" : platform.startsWith("kr") || platform.startsWith("jp") ? "asia" : "europe";
  const probe = async (url: string) => { try { await riot(url); return true; } catch { return false; } };

  // A known-good Riot ID: resolving it proves account-v1 answers for this key.
  const account = await probe(`https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Faker/KR1`);
  // Status endpoints need the key but no account, so they isolate key validity
  // from "that summoner doesn't exist on this shard".
  const summoner = await probe(`https://${platform}.api.riotgames.com/lol/status/v4/platform-data`);
  // Not on the approved 39, on purpose — see RIOT_PROBE_ONLY_PATHS, which
  // names this exact path. Written out in full rather than interpolated from
  // the constant so that a scanner reading this file for Riot URLs sees it.
  const production = await probe(`https://${region}.api.riotgames.com/val/status/v1/platform-data`);

  const note = !account && !summoner
    ? "The key is rejected everywhere. A personal key does not expire, so check it was not revoked or overwritten in the environment before regenerating one at developer.riotgames.com — and remember env changes need a redeploy."
    : production
      ? "Production access is live: methods beyond the approved 39 now answer. Update lib/providers/riot-methods.ts before calling any of them."
      : "League works, on the personal key's 39 methods. There are no VAL-* methods on this key at all, so VALORANT accounts are proven through the Riot ID both games share — which needs no further approval.";
  return { configured, account, summoner, production, note };
}
