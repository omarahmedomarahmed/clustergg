// Stage 2 — the registry, and the four changes docs/11-PORTED-CODE.md and
// docs/08-BUILD-ORDER.md required on arrival.
//
// Every assertion here walks the registry rather than naming providers. A
// guard that checks `riot-lol` guards `riot-lol`; a guard that walks catches
// the provider somebody adds next year without reading §4.3.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import {
  PROVIDERS,
  getProvider,
  isProviderLive,
  isScoreable,
  scoreableMetrics,
  linkableGames,
  proofMethodFor,
  canProveOwnership,
  lolTierValue,
  LOL_TIERS,
  QUEUES,
  isQueue,
  DEFAULT_QUEUE,
} from "../../lib/providers/registry.ts";
import { ADAPTERS, scrubSecrets, isStaleIdentifier } from "../../lib/providers/adapters.ts";

test("the registry is populated, so everything below walks something", () => {
  ok(PROVIDERS.length > 10, "the registry carries the provider set that is the moat");
  // A provider that CAN be live must be able to do something. One that
  // declares itself not live — VALORANT for a missing endpoint, PSN and Call
  // of Duty pending legal sign-off — legitimately has neither metrics nor an
  // adapter, and saying so in the data beats an allowlist of names here.
  const sellable = PROVIDERS.filter((p) => !p.notLive);
  ok(sellable.length > 10, "and most of them are sellable");
  eq(
    sellable.filter((p) => p.capabilities.length === 0).map((p) => p.id),
    [],
    "every sellable provider declares at least one metric",
  );
});

test("League counts matches, from the one call that already returns them", () => {
  const lol = getProvider("riot-lol");
  ok(lol !== undefined, "League is in the registry");
  const keys = lol.capabilities.map((c) => c.key);
  ok(keys.includes("matches"), "matches is a capability — C19, always counted and always shown");
  ok(keys.includes("wins"), "alongside wins");
  ok(keys.includes("losses"), "and losses, which is what matches is made of");
});

test("no ratio, rate or percentage can score a challenge", () => {
  // C16: wins and matches, counted. No win rate, no percentages, no ratios.
  // Walked across every provider, so this holds for the next one added too.
  const offenders: string[] = [];
  for (const p of PROVIDERS) {
    for (const m of p.capabilities) {
      const ratioShaped =
        m.unit === "%" || /(_rate|_ratio|^kda$|^accuracy$)/.test(m.key);
      if (ratioShaped && isScoreable(m)) offenders.push(`${p.id}: ${m.key}`);
    }
  }
  eq(offenders, [], "a ratio's delta measures nothing, so no ratio is scoreable");
});

test("the explicit flag and the shape rule never disagree", () => {
  // Two mechanisms guard the same rule. If they ever diverge, one of them is
  // lying and it is not obvious which — so fail while it is still cheap.
  const disagreements: string[] = [];
  for (const p of PROVIDERS) {
    for (const m of p.capabilities) {
      const shapeSaysNo = m.unit === "%" || /(_rate|_ratio|^kda$|^accuracy$)/.test(m.key);
      if (shapeSaysNo && m.scoreable !== false) {
        disagreements.push(`${p.id}: ${m.key} is ratio-shaped but not flagged`);
      }
    }
  }
  eq(disagreements, [], "every ratio-shaped metric also carries the explicit flag");
});

test("the builder is offered counts and never percentages", () => {
  const offered = scoreableMetrics("riot-lol").map((m) => m.key);
  ok(offered.includes("wins"), "wins can score");
  ok(offered.includes("matches"), "matches can score");
  no(offered.includes("win_rate"), "win rate cannot");
  ok(offered.length > 0, "and the builder has something to offer");
});

test("VALORANT cannot be sold, whatever keys are configured", () => {
  const val = getProvider("riot-valorant");
  ok(val !== undefined, "VALORANT is still in the registry — the identity is real");
  ok(typeof val.notLive === "string", "and it is declared not live, with the reason");
  ok(
    /production/.test(val.notLive) || /no VALORANT endpoint/.test(val.notLive),
    "the reason names what is actually missing, not a vague 'unavailable'",
  );

  // The point of the flag: the key check would say yes.
  const before = process.env.RIOT_API_KEY;
  process.env.RIOT_API_KEY = "a-configured-key";
  try {
    no(isProviderLive(val), "a configured Riot key does not make VALORANT live");
    const lol = getProvider("riot-lol");
    ok(lol !== undefined, "League is there to compare against");
    ok(isProviderLive(lol), "while a configured key does make League live");
  } finally {
    if (before === undefined) delete process.env.RIOT_API_KEY;
    else process.env.RIOT_API_KEY = before;
  }

  no(
    linkableGames({ live: true }).some((g) => g.provider === "riot-valorant"),
    "and VALORANT is not offered as a linkable live game",
  );
});

test("the League queue is a per-challenge setting", () => {
  eq([...QUEUES], ["solo", "flex", "both"], "solo, flex, or both — C24");
  ok(isQueue(DEFAULT_QUEUE), "the default is one of them");
  no(isQueue("ranked"), "and something that is not a queue is not a queue");
});

test("ownership proof is declared per provider, and its absence is not a penalty", () => {
  eq(proofMethodFor("riot-lol"), "icon", "Riot proves by profile icon");
  ok(canProveOwnership("riot-lol"), "so League ownership can be required");

  // Chess.com is a public API keyed by a username anybody can type. It can
  // show the account exists; it cannot show it is yours. G5: that is not the
  // gamer's fault and carries no penalty.
  eq(proofMethodFor("chesscom"), null, "a public-name API cannot prove ownership");
  no(canProveOwnership("chesscom"), "and says so plainly rather than pretending");

  ok(
    linkableGames({ live: true }).some((g) => g.provider === "chesscom"),
    "an unprovable game is still offered — no second class",
  );
});

test("the rank ladder is division-aware", () => {
  // The ported comment records what this used to do: `tier * 400 + LP` put
  // Gold IV and Gold I at the same value, so a leaderboard could not separate
  // the bottom of a tier from the top.
  const goldIV = lolTierValue("GOLD", "IV", 0);
  const goldI = lolTierValue("GOLD", "I", 0);
  ok(goldI > goldIV, "Gold I outranks Gold IV");
  ok(
    lolTierValue("PLATINUM", "IV", 0) > lolTierValue("GOLD", "I", 99),
    "and the bottom of the next tier outranks the top of this one",
  );
  eq(lolTierValue("NOT_A_TIER", "I", 0), 0, "an unknown tier is not silently Challenger");
  ok(
    LOL_TIERS.includes("EMERALD"),
    "the ladder knows about Emerald, which Riot added after most code was written",
  );
});

test("provider errors never carry a key", () => {
  const before = process.env.RIOT_API_KEY;
  process.env.RIOT_API_KEY = "RGAPI-0000-1111-2222-3333-444444444444";
  try {
    const scrubbed = scrubSecrets(
      "GET https://euw1.api.riotgames.com/x?api_key=RGAPI-0000-1111-2222-3333-444444444444 failed",
    );
    no(
      scrubbed.includes("RGAPI-0000-1111-2222-3333-444444444444"),
      "the key is gone from an error that will be shown on a profile page",
    );
  } finally {
    if (before === undefined) delete process.env.RIOT_API_KEY;
    else process.env.RIOT_API_KEY = before;
  }
});

test("a stale Riot identifier is recognised by what Riot actually says", () => {
  ok(
    isStaleIdentifier("400 Bad Request - Exception decrypting abc123"),
    "the message that took every League account down is recognised",
  );
  no(
    isStaleIdentifier("429 Rate limit exceeded"),
    "and a rate limit is not mistaken for one",
  );
});

test("every sellable provider has an adapter", () => {
  const missing = PROVIDERS.filter((p) => !p.notLive && !ADAPTERS[p.id]).map((p) => p.id);
  eq(missing, [], "a sellable provider with no adapter is a game that could never sync");
});

test("the League adapter itself does not touch the tight endpoint on a routine sync", async () => {
  // This test exists because breaking the guard was caught by NOTHING. The
  // sync suite drives a fake adapter, so it proved that `syncAccount` passes
  // `rich` through — not that the League adapter honours it. The endpoint
  // choice lives in the adapter, so the assertion has to live at the adapter.
  //
  // `summoner-v4 by-puuid` is 1,600 requests a minute. `league-v4 entries` is
  // 20,000 per ten seconds and carries tier, division, LP, wins and losses for
  // both queues. One of those belongs on an hourly job across every linked
  // League account and one does not.
  const realFetch = globalThis.fetch;
  const realKey = process.env.RIOT_API_KEY;
  process.env.RIOT_API_KEY = "test-key-for-url-capture";
  const called: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    called.push(url);
    return new Response(url.includes("/entries/") ? "[]" : "{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const ref = { providerAccountId: "puuid-1", inGameName: "T#EUW", region: "euw1" };

    called.length = 0;
    await ADAPTERS["riot-lol"].fetchStats(ref);
    ok(
      called.some((u) => u.includes("/lol/league/v4/entries/by-puuid/")),
      "a routine sync reads league-v4, which is the whole scoring requirement",
    );
    eq(
      called.filter((u) => u.includes("/lol/summoner/v4/")),
      [],
      "and never spends the 1,600-a-minute endpoint",
    );

    called.length = 0;
    await ADAPTERS["riot-lol"].fetchStats({ ...ref, rich: true });
    ok(
      called.some((u) => u.includes("/lol/summoner/v4/")),
      "while an explicit rich call — linking, reconnecting — still may",
    );
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.RIOT_API_KEY;
    else process.env.RIOT_API_KEY = realKey;
  }
});
