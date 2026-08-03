// Proving a Riot account belongs to the person linking it.
//
// The problem this solves: `adapter.verify()` asks Riot whether "Faker#KR1"
// exists. It does. That is not the same as the person typing it being Faker,
// and on a platform paying prize money the difference is the whole game.
//
// Riot's own answer is RSO — real OAuth — and RSO needs a PRODUCTION key with
// an approved product registration. We have a development key. So we use the
// method every third-party League site uses and that Riot's developer policy
// explicitly contemplates: ask the gamer to set their in-game profile icon to
// one we name, then read it back from summoner-v4.
//
// Why it holds: only someone logged into that account can change its icon, the
// icon we pick is random per attempt, and the window is short. Someone watching
// can't pre-empt it and can't reuse it.
//
// Why it works on a dev key: `/lol/summoner/v4/summoners/by-puuid` is not one
// of the production-gated endpoints. `/riot/account/v1` isn't either — which is
// what lets VALORANT ride along: one Riot account has ONE puuid across League
// and VALORANT, so an icon proven in League proves the same human in VALORANT
// without touching a single VAL-* endpoint.

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
 * A development key expires every 24 hours, and when it does every Riot link
 * and every Riot sync fails with a 403 that nothing surfaces. This is the probe
 * behind the admin health panel, so "why is League broken" has an answer.
 */
export async function riotKeyHealth(platform = "euw1"): Promise<{
  configured: boolean;
  account: boolean;
  summoner: boolean;
  valorant: boolean;
  note: string;
}> {
  const configured = !!process.env.RIOT_API_KEY;
  if (!configured) {
    return { configured, account: false, summoner: false, valorant: false, note: "RIOT_API_KEY is not set." };
  }
  const region = platform.startsWith("na") ? "americas" : platform.startsWith("kr") || platform.startsWith("jp") ? "asia" : "europe";
  const probe = async (url: string) => { try { await riot(url); return true; } catch { return false; } };

  // A known-good Riot ID: resolving it proves account-v1 answers for this key.
  const account = await probe(`https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Faker/KR1`);
  // Status endpoints need the key but no account, so they isolate key validity
  // from "that summoner doesn't exist on this shard".
  const summoner = await probe(`https://${platform}.api.riotgames.com/lol/status/v4/platform-data`);
  const valorant = await probe(`https://${region}.api.riotgames.com/val/status/v1/platform-data`);

  const note = !account && !summoner
    ? "The key is rejected everywhere — a development key expires 24 hours after it is generated. Regenerate it at developer.riotgames.com and redeploy."
    : valorant
      ? "VALORANT endpoints answer, so this key has production access."
      : "League works. VALORANT's VAL-* endpoints need a production key, so VALORANT accounts are verified through the shared Riot ID instead — which needs no extra approval.";
  return { configured, account, summoner, valorant, note };
}
