// The same trophy, held more than once, is ONE tile. B62.1.
//
// A gamer can hold the same trophy several times over — bought one, won one in
// a challenge, earned one at a streak milestone. Drawn one row per award that is
// three identical pictures in a row, which reads as a rendering bug rather than
// an achievement. **The count is the impressive part.**
//
// THE DEFECT THIS CLOSES is not that nobody had built it. The bot card has
// stacked since B62 — the web never did, and the grouping lived inline in
// `lib/cards/data.ts` where no other surface could reach it. So the same
// gamer's shelf looked like a different shelf depending on where you saw it,
// and the reason was one `reduce` in the wrong file.
//
//   DEMO_DB=1 npx tsx tests/db/trophy-stack.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const { stackTrophies } = await import("../../lib/trophy-stack.ts");

const award = (o: Partial<{ id: string; name: string; imageUrl: string; value: number; awardedAt: string; status: string }> = {}) => ({
  id: o.id ?? "a1",
  name: o.name ?? "Nebula Cup",
  imageUrl: o.imageUrl ?? "https://x/n.png",
  value: o.value ?? 25,
  awardedAt: o.awardedAt ?? "2026-01-01T00:00:00.000Z",
  status: o.status ?? "held",
});

console.log("== the grouping itself ==");
{
  eq("nothing stacks to nothing", stackTrophies([]), []);

  const one = stackTrophies([award()]);
  eq("one award is one tile", one.length, 1);
  eq("…with a count of 1", one[0].count, 1);
  ok("…and still carries its own fields", one[0].name === "Nebula Cup" && one[0].value === 25);

  const three = stackTrophies([
    award({ id: "a1", awardedAt: "2026-03-01T00:00:00.000Z" }),
    award({ id: "a2", awardedAt: "2026-02-01T00:00:00.000Z" }),
    award({ id: "a3", awardedAt: "2026-01-01T00:00:00.000Z" }),
  ]);
  eq("three copies are ONE tile", three.length, 1);
  eq("…counted", three[0].count, 3);
  eq("…with every id kept", three[0].ids.sort(), ["a1", "a2", "a3"]);
  eq("…and every award kept", three[0].awards.length, 3);
  eq("…and the stack's total value", three[0].stackValue, 75);

  const mixed = stackTrophies([
    award({ id: "a1", name: "Nebula Cup" }),
    award({ id: "b1", name: "Solar Crown", imageUrl: "https://x/s.png" }),
    award({ id: "a2", name: "Nebula Cup" }),
  ]);
  eq("different trophies do not merge", mixed.length, 2);
  eq("…and each counts its own", mixed.map((m) => m.count).sort(), [1, 2]);
}

console.log("\n== the key is name + image, not the trophy id ==");
{
  // Deliberately the key the card has always used. Two `trophies` rows can be
  // the same prize to a person — staff duplicating one for a second brand, or a
  // re-issue — and a gamer looking at two identical pictures does not care that
  // they carry different ids. Grouping on `trophyId` leaves exactly the
  // duplicate-looking tiles this exists to remove.
  const reissued = stackTrophies([
    { ...award({ id: "x1" }), trophyId: "trophy-old" } as never,
    { ...award({ id: "x2" }), trophyId: "trophy-new" } as never,
  ]);
  eq("a re-issued trophy stacks with the original", reissued.length, 1);
  eq("…as two", reissued[0].count, 2);

  const sameNameDifferentArt = stackTrophies([
    award({ id: "y1", name: "Cup", imageUrl: "https://x/1.png" }),
    award({ id: "y2", name: "Cup", imageUrl: "https://x/2.png" }),
  ]);
  eq("the same name with different art does NOT stack", sameNameDifferentArt.length, 2);

  const src = code("lib/trophy-stack.ts");
  ok("the key is stated once", /const key = `\$\{a\.name\}::\$\{a\.imageUrl\}`/.test(src));
  ok("…and it is not the trophy id", !/\.trophyId/.test(src));
}

console.log("\n== the newest award wins the visible details ==");
{
  // A gamer looking for the trophy they just earned should find its challenge
  // name on the tile, not the one from a year ago.
  const out = stackTrophies([
    { ...award({ id: "old", awardedAt: "2025-01-01T00:00:00.000Z" }), challengeTitle: "Old Cup" } as never,
    { ...award({ id: "new", awardedAt: "2026-06-01T00:00:00.000Z" }), challengeTitle: "New Cup" } as never,
  ]);
  eq("one tile", out.length, 1);
  eq("…showing the newest", (out[0] as { challengeTitle?: string }).challengeTitle, "New Cup");
  eq("…while still counting both", out[0].count, 2);
  eq("…and keeping both ids", out[0].ids.sort(), ["new", "old"]);

  // Order-independent: the same set fed in the other order must agree.
  const reversed = stackTrophies([
    { ...award({ id: "new", awardedAt: "2026-06-01T00:00:00.000Z" }), challengeTitle: "New Cup" } as never,
    { ...award({ id: "old", awardedAt: "2025-01-01T00:00:00.000Z" }), challengeTitle: "Old Cup" } as never,
  ]);
  eq("…whichever order they arrive in",
    (reversed[0] as { challengeTitle?: string }).challengeTitle, "New Cup");
  eq("…with the same count", reversed[0].count, out[0].count);
  eq("…and the same total", reversed[0].stackValue, out[0].stackValue);
}

console.log("\n== all three surfaces share ONE rule ==");
{
  // THE ASSERTION THIS FILE EXISTS FOR. The bug was never that stacking was
  // hard; it was that the code for it sat inline in the card's data layer where
  // nothing else could use it.
  for (const f of ["lib/cards/data.ts", "app/u/[slug]/page.tsx", "components/TrophyCase.tsx"]) {
    ok(`${f} calls stackTrophies`, /stackTrophies\(/.test(code(f)),
      "a second copy of the grouping is a second chance to pick a different key");
    ok(`…and holds no grouping of its own`,
      !/`\$\{[a-z]\.name\}::\$\{[a-z]\.imageUrl\}`/.test(code(f)),
      "the inline reduce is what let the card and the web disagree");
  }
  // The pure module must stay importable from a client component.
  const pure = read("lib/trophy-stack.ts");
  ok("the rule module imports nothing",
    !/^import /m.test(pure),
    "TrophyCase is a client component — pulling lib/trophies.ts in drags Drizzle and the schema into the browser");
  ok("…and lib/trophies.ts re-exports it, so servers still have one place to look",
    /export \{ stackTrophies/.test(read("lib/trophies.ts")));
}

console.log("\n== a stack is honest about what is actually redeemable ==");
{
  // A stack of three where one is already in a payout is a real state. "×3"
  // alone would promise three redeemable trophies when only two are.
  const tc = read("components/TrophyCase.tsx");
  ok("the tile counts only usable copies for selection",
    /const usable = st\.awards\.filter\(\(a\) => a\.status === "held" && a\.value > 0\)/.test(tc));
  ok("…and shows how many are mid-payout",
    /inRedeem > 0/.test(tc) && /in redeem/.test(tc));
  ok("the price shown is the STACK's, not one copy's",
    /const stackValue = usable\.reduce/.test(tc),
    "a tap selects the whole stack, so the number beside it must be what the tap adds");
  ok("selection stays per-award underneath",
    /for \(const a of usable\) next\[a\.id\] = !on;/.test(tc),
    "the redeem request still sends individual ids — nothing about the payout path changed");
}

console.log("\n== no price on a profile, which is the other half of B62 ==");
{
  const profile = code("app/u/[slug]/page.tsx");
  const trophySection = profile.slice(profile.indexOf('case "trophies":'), profile.indexOf('case "challenges":'));
  ok("the public trophy grid draws no cash figure",
    !/\$\{?[a-z]*\.?value/i.test(trophySection) && !/\.value\.toLocaleString/.test(trophySection),
    "a price on a profile turns a trophy case into a receipt");
  ok("…and it does show the count", /×\{a\.count\}/.test(read("app/u/[slug]/page.tsx")));

  // The card was already right. Keep it that way.
  const render = code("lib/cards/render.tsx");
  ok("the profile card still draws the count", /x\$\{x\.count\}/.test(render));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
