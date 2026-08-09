/**
 * Every card kind actually renders. B115 — owed since B54.
 *
 * ===== WHY THIS COULD ONLY EVER BE A BROWSER-BAND SUITE =====
 *
 * A card is Satori turning React into an SVG and resvg turning that into a PNG,
 * inside a route handler, against real rows. Nothing about that is exercised by
 * `tsc`, and the db band cannot reach it: the failure modes are a font that did
 * not load, an image host that 403s, a `flex` Satori refuses, a data layer that
 * returns null for a kind nobody looked at this month. Every one of those is a
 * 500 or a blank rectangle at request time and green everywhere else.
 *
 * `lib/cards/render.tsx` has THIRTEEN card bodies. Before this file, exactly one
 * of them was ever rendered by any test — the guide card, incidentally, inside
 * `bot-growth`. The other twelve were verified by somebody looking at Discord.
 *
 * ===== THE ASSERTION THAT MATTERS MOST =====
 *
 * Not "did it return 200". A card route that cannot resolve its data falls back
 * to a generic "nothing to show yet" card and returns **200 with a valid PNG**.
 * So a kind can be completely broken and look perfectly healthy to any check
 * that stops at the status code.
 *
 * So this suite FINGERPRINTS the fallback — it asks for a card that certainly
 * has no data, hashes the PNG, and asserts no real kind matches it. That is the
 * check no human would do by eye across thirteen cards, and the first version of
 * it here was too weak to catch a single broken kind. See the block below.
 *
 *   scripts/with-server.sh 3031 node tests/ui/cards.mjs
 */
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

/**
 * Every kind the route serves, with the params `?preview=1` cannot invent.
 *
 * `preview=1` fills in a slug, a game, a quest and a challenge from real rows,
 * which is what makes this suite possible without fixtures — but it does not
 * cover the leaderboard's metric or the world card's entity, so those carry
 * their own.
 */
const KINDS = [
  { kind: "profile", q: "" },
  { kind: "game-stats", q: "" },
  { kind: "quest", q: "" },
  { kind: "cp", q: "" },
  { kind: "leaderboard", q: "" },
  { kind: "planet", q: "" },
  { kind: "planets", q: "" },
  { kind: "challenge", q: "" },
  { kind: "guide", q: "&topic=getting-started" },
  { kind: "market", q: "" },
  { kind: "week", q: "" },
  { kind: "world", q: "" },
  { kind: "search", q: "&q=nova" },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

try {
  console.log("== every kind returns a real PNG ==");
  const seen = new Map();

  for (const { kind, q } of KINDS) {
    // `fresh=1` so a cached Blob redirect cannot make a broken renderer look
    // healthy — the whole point is to run the renderer, not to check that
    // something was once rendered.
    const url = `${BASE}/api/card/${kind}?preview=1&fresh=1${q}`;
    let res = null;
    try {
      res = await page.request.get(url, { timeout: 45000 });
    } catch (e) {
      ok(`${kind}: responds`, false, String(e).slice(0, 90));
      continue;
    }

    ok(`${kind}: 200`, res.status() === 200, `status ${res.status()}`);
    if (res.status() !== 200) continue;

    const type = res.headers()["content-type"] ?? "";
    ok(`${kind}: is an image`, /image\/(png|webp)/.test(type), type);

    const body = await res.body();
    // A PNG under ~4KB at card dimensions is a blank rectangle. The real cards
    // are tens of kilobytes because they carry artwork.
    ok(`${kind}: is not a blank rectangle`, body.length > 4000, `${body.length} bytes`);
    // The magic number, because a 200 with an HTML error page is a thing that
    // happens and `content-type` can lie.
    ok(`${kind}: has a PNG header`,
      body.length > 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47,
      [...body.slice(0, 4)].map((b) => b.toString(16)).join(" "));

    seen.set(kind, createHash("sha256").update(body).digest("hex"));
  }

  console.log("\n== no kind is silently drawing the fallback ==");
  {
    // THE ASSERTION THIS FILE EXISTS FOR, and the first version of it was too
    // weak to matter.
    //
    // The route answers **200 with a valid PNG** when it cannot resolve a
    // kind's data: `if (!data) return fallbackCard(...)`. So a completely
    // broken card kind looks healthy to any check that stops at the status
    // code, the content-type or the byte length.
    //
    // The first attempt compared every kind's hash against every other kind's.
    // That passes when exactly ONE kind is broken — its fallback bytes are
    // still unique within the set — which is both the common case and the one
    // worth catching. Proved by disabling `planetsCard`: 58/58 green.
    //
    // So the fallback is FINGERPRINTED instead. `fallbackCard` takes the same
    // string on every path and returns before `withCardAd`, so it renders
    // byte-identical every time. Ask for a card that certainly has no data,
    // hash it, and assert no real kind matches.
    const probe = await page.request.get(
      `${BASE}/api/card/profile?slug=definitely-not-a-real-slug-${Date.now()}&fresh=1`,
    );
    const fallbackHash = probe.status() === 200
      ? createHash("sha256").update(await probe.body()).digest("hex")
      : null;
    ok("the fallback card can be fingerprinted", !!fallbackHash,
      `probe returned ${probe.status()} — without this the check below is blind`);

    if (fallbackHash) {
      const fellBack = [...seen].filter(([, h]) => h === fallbackHash).map(([k]) => k);
      ok("no kind renders the fallback", fellBack.length === 0,
        `${fellBack.join(", ")} returned the "no data" card — broken, and answering 200`);
    }

    // Kept as well: two kinds with identical bytes means one is drawing the
    // other's body, which the fallback check cannot see.
    const byHash = new Map();
    for (const [kind, hash] of seen) byHash.set(hash, [...(byHash.get(hash) ?? []), kind]);
    const dupes = [...byHash.values()].filter((k) => k.length > 1);
    ok("…and no two kinds render the same image", dupes.length === 0,
      dupes.map((g) => g.join(" == ")).join(" | "));
    ok("…and all thirteen were reached", seen.size === KINDS.length,
      `${seen.size} of ${KINDS.length}`);
  }

  console.log("\n== a bad request fails honestly ==");
  {
    // A kind that does not exist must not quietly draw something. Somebody
    // typing `/api/card/profil` should learn that, not receive a card.
    const res = await page.request.get(`${BASE}/api/card/not-a-real-kind?preview=1&fresh=1`);
    ok("an unknown kind is not a 200 PNG",
      res.status() !== 200 || !/image\//.test(res.headers()["content-type"] ?? ""),
      `status ${res.status()} type ${res.headers()["content-type"]}`);

    // A profile card for a gamer who does not exist is the case the OG-image
    // path hits whenever a stale link is shared.
    const missing = await page.request.get(`${BASE}/api/card/profile?slug=definitely-not-a-real-slug&fresh=1`);
    ok("a missing gamer does not 500",
      missing.status() < 500, `status ${missing.status()}`);
  }

  console.log("\n== the cards are actually reachable as OG art ==");
  {
    // `cardMeta` puts these URLs in the page head. A card kind that renders but
    // is never referenced is art nobody sees; a reference that points at a kind
    // the route dropped is a broken preview on every share.
    const res = await page.request.get(`${BASE}/`);
    const html = await res.text();
    const refs = [...html.matchAll(/\/api\/card\/([a-z-]+)/g)].map((m) => m[1]);
    ok("the homepage references at least one card", refs.length > 0);
    const known = new Set(KINDS.map((k) => k.kind));
    const unknown = [...new Set(refs)].filter((r) => !known.has(r));
    ok("…and every referenced kind is one this suite covers", unknown.length === 0,
      unknown.join(", ") + " — a kind is referenced that nothing here renders");
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
