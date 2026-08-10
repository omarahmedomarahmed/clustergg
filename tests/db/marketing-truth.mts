/**
 * B92 — the public pages describe the product that exists.
 *
 * The marketing pages spent three sprints describing a version of Cluster that
 * had been deleted: a per-challenge tier percentage (gone in C3), a podium of
 * exactly three (gone in B91.7), an owner's "share of the platform fee" (there
 * is a weekly pool instead). None of that is a copy nit. A page that quotes a
 * rate is a rate we are held to by the person who read it.
 *
 * So this suite is a DRIFT ALARM, and it works two ways: the showcase must
 * render the real constants rather than retyped ones, and the pages must not
 * contain the claims we retired.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { readFileSync } = await import("node:fs");
const { BRACKETS, PARTICIPATION_SHARE } = await import("../../lib/server-score.ts");
const { STAGE_ORDER } = await import("../../lib/challenge-stage.ts");
const { PRIVATE_FEE_PCT } = await import("../../lib/private-quote.ts");

const atlas = readFileSync("components/marketing/ProductAtlas.tsx", "utf8");

console.log("== the showcase imports the product, it does not paraphrase it ==");
{
  // The whole design. A marketing page that retypes a number drifts from the
  // product within a month; one that imports it cannot.
  for (const [what, needle] of [
    ["the status ladder", 'from "@/lib/challenge-stage"'],
    ["the pool brackets", 'from "@/lib/server-score"'],
    ["the private-challenge price", 'from "@/lib/private-quote"'],
    ["the withdrawal floor", 'from "@/lib/server-wallet"'],
  ] as const) {
    ok(`${what} is imported`, atlas.includes(needle));
  }

  // …and specifically NOT retyped. These are the numbers most likely to be
  // hand-copied by somebody "just fixing the copy".
  const literals = [
    [`${BRACKETS[0].share}`, "a bracket share"],
    [`${PARTICIPATION_SHARE}`, "the flat share"],
    [`${PRIVATE_FEE_PCT}`, "the private fee"],
  ] as const;
  for (const [n, what] of literals) {
    // The number may appear as a rendered expression, but never as a quoted
    // string literal like "60%" — that is the shape of a hand-typed figure.
    ok(`${what} is not hardcoded as text`, !new RegExp(`["'\`][^"'\`]*\\b${n}%`).test(atlas));
  }
}

console.log("\n== every rung of the real ladder is shown ==");
{
  ok("the ladder is rendered from STAGE_ORDER", /STAGE_ORDER\.map/.test(atlas));
  ok(`…which is ${STAGE_ORDER.length} rungs`, STAGE_ORDER.length === 5);
  // The two gates are the least obvious thing in the product and the one most
  // likely to produce "why is my score zero".
  ok("the two gates are explained", /Two gates/.test(atlas));
  ok("…including that entering early buys nothing",
    /no head start/.test(atlas), "");
}

console.log("\n== the claims we retired are gone from public pages ==");
{
  const pages = [
    "app/page.tsx",
    "app/discord-bot/page.tsx",
    "app/brands/page.tsx",
    "components/ServerEarnCards.tsx",
    "components/StructuredData.tsx",
    "components/marketing/ProductAtlas.tsx",
  ];
  // COMMENTS ARE STRIPPED FIRST, and that is not laziness. Several of these
  // files carry a comment naming the rate that was deleted and why — which is
  // exactly the note that stops somebody reintroducing it. Failing the suite
  // for explaining a retired promise would delete the explanation.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  for (const f of pages) {
    const src = stripComments(readFileSync(f, "utf8"));
    // C3: the per-challenge owner rate. Running both models would pay an owner
    // twice out of one 15% line, which is why the rate was deleted.
    ok(`${f}: no "share of the platform fee"`,
      !/share of the platform fee/i.test(src));
    ok(`${f}: no tier percentage promised to owners`,
      !/\b(5|10|25)%\s*(at|of)\s*(500|1,?000|5,?000|every (sponsored )?challenge)/i.test(src));
    // B91.7: a podium is any depth now.
    ok(`${f}: does not promise exactly three winners`,
      !/the three gamers who win|top three take|only the top 3 win/i.test(src));
  }
}

console.log("\n== no surface quotes a price or a rate the product does not have ==");
{
  // B117. Five customer-facing surfaces still said "$250 a challenge" — the
  // site-wide meta description, the pricing page's, the /answers page's, the
  // CMS default copy, and the FAQ schema that Google and the answer engines
  // index. The price had been $350 for three sprints.
  //
  // Five more still promised the PER-CHALLENGE OWNER RATE deleted in C3 — "you
  // take a share of the fee on every sponsored challenge that runs there". The
  // check above walked past every one of them, because it greps for the exact
  // phrase "share of the platform fee" and these all said "share of the fee".
  // A guard pinned to one wording is a guard that catches one file.
  //
  // So both checks are widened, and widened over EVERY page and component
  // rather than a list of six that somebody has to remember to extend.
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { PRICING_DEFAULTS, money } = await import("../../lib/pricing.ts");

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e.startsWith(".") || e === "node_modules") continue;
      const rel = join(dir, e);
      if (statSync(rel).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e)) files.push(rel);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(d);

  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  // Any dollar figure sitting immediately before "a challenge" / "a sponsored
  // challenge" is a rate card. There is exactly one right answer for it.
  const live = money(PRICING_DEFAULTS.challengePrice, PRICING_DEFAULTS.currency);
  const rateRe = /\$[\d,]+(?:\.\d\d)?(?=\s+(?:a|per)\s+(?:sponsored\s+)?challenge\b)/g;
  const wrongPrice: string[] = [];
  for (const f of files) {
    for (const hit of strip(readFileSync(f, "utf8")).match(rateRe) ?? []) {
      if (hit !== live) wrongPrice.push(`${f}: "${hit} a challenge" (live: ${live})`);
    }
  }
  ok("no surface quotes a challenge price that is not the live one",
    wrongPrice.length === 0, wrongPrice.slice(0, 6).join(" | "));

  // The owner rate, in every phrasing anybody actually wrote. C3 deleted it
  // because running it alongside the weekly pool pays an owner twice out of
  // one line — so a page promising it is a term we are held to for money we
  // never agreed to pay.
  const ownerRate = /\b(?:you|your server|owners?|they)\s+(?:take|takes|earn|earns|get|gets)\s+a\s+share\s+of\s+(?:the\s+)?(?:fee|platform fee|revenue)|share of (?:the )?(?:platform )?fee on every|share of every (?:sponsored )?challenge/i;
  const promised = files.filter((f) => ownerRate.test(strip(readFileSync(f, "utf8"))));
  ok("no surface promises an owner a per-challenge rate",
    promised.length === 0,
    `${promised.slice(0, 6).join(", ")} — C3 deleted it; the model is a weekly pool`);

  // B118. The three-tier rate card — Reach, Challenge, Ultimate — was merged
  // into one package by C11, but the pricing page kept rendering all three
  // cards, two of them priced off bases of zero. A brand could pick a plan we
  // do not sell. The deck showed the same three to investors, the enquiry form
  // labelled the buyer with one, and the brand portal put "Reach tier" at the
  // top of their own dashboard.
  //
  // Rendered text only — the config fields survive at 0 on purpose, guarded by
  // `tests/db/split.mts`, and the comments explaining why they went are the
  // notes that stop somebody reviving them.
  const planName = /["'`>][^"'`<]*\b(?:Reach|Ultimate)\s+(?:tier|plan)\b|["'`]Ultimate["'`]\s*[,)}]|tier\.(?:reach|ultimate)\./;
  const named = files.filter((f) => {
    const src = strip(readFileSync(f, "utf8"));
    return planName.test(src);
  });
  ok("no surface renders a retired plan name", named.length === 0,
    `${named.slice(0, 6).join(", ")} — C11 merged the three tiers into one package`);
}

console.log("\n== the showcase is actually on the pages ==");
{
  // A component nobody renders is a component that rots. All three public
  // audiences land somewhere different, and all three need the mechanism.
  for (const f of ["app/page.tsx", "app/discord-bot/page.tsx", "app/brands/page.tsx"]) {
    ok(`${f} renders it`, /ProductAtlas/.test(readFileSync(f, "utf8")));
  }
  // The brand page shows the compact one: a brand does not need the server
  // owner's wallet arithmetic.
  ok("the brand page uses the compact form",
    /ProductAtlas compact/.test(readFileSync("app/brands/page.tsx", "utf8")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
