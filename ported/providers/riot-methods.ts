// The Riot methods this key is actually allowed to call.
//
// ===== WHY THIS FILE EXISTS =====
//
// Riot approved ClusterGG for a PERSONAL key, not a production key. A personal
// key carries 39 methods; the development key we built against carried 59. The
// difference is silent: an unapproved method does not fail at deploy time, it
// returns 403 to one gamer in one sync, in production, and everything else
// keeps working. There is no way to notice that by reading the code.
//
// So the approved set is written down here, once, and `tests/db/riot-methods.mts`
// asserts that every Riot URL in `lib/providers/` is inside it. Reaching for a
// method we do not have now goes red in the test band instead of in someone's
// League link.
//
// ===== THE THREE FACTS THAT SHAPE THE CODE =====
//
// 1. `summoner-v4` offers ONLY `by-puuid`. There is no by-name and no
//    by-account. Every path into League therefore starts at a Riot ID and goes
//    through `account-v1/accounts/by-riot-id` to get a PUUID; that PUUID is the
//    key to everything else. `lib/providers/adapters.ts` already links this way.
//
// 2. `spectator-v5`'s path reads `active-games/by-summoner/{...}` but its
//    parameter is `{encryptedPUUID}`. Passing a PUUID there is correct, not a
//    bug — `lib/providers/riot-lol-rich.ts` does, and should keep doing.
//
// 3. There are NO `val/*` methods at all. VALORANT works only because one Riot
//    account has one PUUID across both games, so proving the League profile
//    icon proves the same human in VALORANT. See `lib/providers/riot-verify.ts`.
//
// ===== RATE LIMITS =====
//
// Two tiers, and the gap between them is three orders of magnitude:
//
//   summoner-v4 by-puuid          1,600 / minute      <-- the binding limit
//   league-v4 entries by tier        50 / 10 seconds  <-- leaderboard scraping
//   match-v5                      2,000 / 10 seconds
//   account-v1 by-riot-id         1,000 / minute
//   spectator-v5                  3,000 / 10 seconds
//   everything else              20,000 / 10 seconds
//
// `summoner-v4` is the one to watch: it is called on every stat sync AND on
// every press of Verify during icon proof, and 1,600/min is the tightest
// allowance in the whole set by a wide margin.
//
// ===== IF THE PRODUCTION KEY IS GRANTED =====
//
// Add the newly approved methods here in the same commit that starts calling
// them. Do not widen this list "in advance": the point of the list is that it
// describes the key we hold today, and a list describing a key we hope to hold
// catches nothing.

/**
 * Every method on the approved personal key, path only, with each parameter
 * segment written as `{}`.
 *
 * Transcribed from the Riot developer portal's method list for this key. Riot
 * lists 39 rows; two `account-v1` methods appear twice under different rate
 * limits, so 37 distinct paths.
 */
export const RIOT_APPROVED_PATHS: readonly string[] = [
  // summoner-v4 — by-puuid ONLY
  "/lol/summoner/v4/summoners/by-puuid/{}",
  // league-v4
  "/lol/league/v4/challengerleagues/by-queue/{}",
  "/lol/league/v4/masterleagues/by-queue/{}",
  "/lol/league/v4/grandmasterleagues/by-queue/{}",
  "/lol/league/v4/entries/{}/{}/{}",
  "/lol/league/v4/entries/by-puuid/{}",
  // league-exp-v4
  "/lol/league-exp/v4/entries/{}/{}/{}",
  // clash-v1
  "/lol/clash/v1/teams/{}",
  "/lol/clash/v1/tournaments",
  "/lol/clash/v1/tournaments/{}",
  "/lol/clash/v1/tournaments/by-team/{}",
  "/lol/clash/v1/players/by-puuid/{}",
  // account-v1
  "/riot/account/v1/accounts/by-riot-id/{}/{}",
  "/riot/account/v1/accounts/by-puuid/{}",
  "/riot/account/v1/region/by-game/{}/by-puuid/{}",
  // lol-status-v4
  "/lol/status/v4/platform-data",
  // match-v5
  "/lol/match/v5/matches/{}",
  "/lol/match/v5/matches/{}/timeline",
  "/lol/match/v5/matches/by-puuid/{}/ids",
  "/lol/match/v5/matches/by-puuid/{}/replays",
  // lol-challenges-v1
  "/lol/challenges/v1/challenges/config",
  "/lol/challenges/v1/challenges/percentiles",
  "/lol/challenges/v1/challenges/{}/config",
  "/lol/challenges/v1/challenges/{}/percentiles",
  "/lol/challenges/v1/challenges/{}/leaderboards/by-level/{}",
  "/lol/challenges/v1/player-data/{}",
  // champion-mastery-v4
  "/lol/champion-mastery/v4/champion-masteries/by-puuid/{}",
  "/lol/champion-mastery/v4/champion-masteries/by-puuid/{}/top",
  "/lol/champion-mastery/v4/champion-masteries/by-puuid/{}/by-champion/{}",
  "/lol/champion-mastery/v4/scores/by-puuid/{}",
  // tournament-stub-v5
  "/lol/tournament-stub/v5/codes",
  "/lol/tournament-stub/v5/codes/{}",
  "/lol/tournament-stub/v5/lobby-events/by-code/{}",
  "/lol/tournament-stub/v5/providers",
  "/lol/tournament-stub/v5/tournaments",
  // spectator-v5 — the parameter is a PUUID despite the path saying "by-summoner"
  "/lol/spectator/v5/active-games/by-summoner/{}",
  // champion-v3
  "/lol/platform/v3/champion-rotations",
];

/**
 * Paths we call ON PURPOSE while not being approved for them.
 *
 * Exactly one, and it is a probe rather than a feature: the only way to find
 * out whether the key has been upgraded to production is to call something the
 * personal key cannot reach and see whether it answers. It is expected to 403,
 * the 403 is the informative result, and no gamer-facing behaviour depends on
 * it — `riotKeyHealth` is an admin panel.
 *
 * This list lives here, next to the approved set, so adding a second entry is a
 * visible change to the source of truth and has to be argued for. It is not an
 * escape hatch for "the test is in the way".
 */
export const RIOT_PROBE_ONLY_PATHS: readonly string[] = [
  "/val/status/v1/platform-data",
];

/**
 * The tightest allowance on the key, and the endpoint it applies to.
 *
 * Exported rather than commented so a future throttle imports the number
 * instead of retyping it.
 */
export const RIOT_SUMMONER_V4_PER_MINUTE = 1600;

/**
 * Reduce a Riot URL — as written in source, template literals and all — to the
 * shape used above: leading host and trailing query removed, every interpolated
 * or otherwise variable segment replaced by `{}`.
 */
export function riotPathShape(url: string): string {
  const after = url.replace(/^.*?\.api\.riotgames\.com/, "");
  const path = after.split(/[?#]/)[0].replace(/\/+$/, "");
  return path
    .split("/")
    .map((seg) => (seg.includes("${") || /^\{.*\}$/.test(seg) ? "{}" : seg))
    .join("/");
}

/**
 * Is this path one the key can call?
 *
 * A literal segment in the source (`.../by-riot-id/Faker/KR1` in the health
 * probe) matches an approved `{}`, but never the other way round: an approved
 * literal like `platform-data` must be present exactly.
 */
export function isApprovedRiotPath(shape: string): boolean {
  const got = shape.split("/");
  return RIOT_APPROVED_PATHS.some((approved) => {
    const want = approved.split("/");
    return want.length === got.length
      && want.every((seg, i) => seg === "{}" || seg === got[i]);
  });
}
