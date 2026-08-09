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
