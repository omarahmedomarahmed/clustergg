/**
 * There is ONE ladder, and every surface reads it. M3.
 *
 * ===== WHAT THIS EXISTS TO CATCH =====
 *
 * Five lists of server sizes lived in five files:
 *
 *   lib/server-earnings.ts  EARN_TIERS          0 / 500 / 1,000 / 5,000
 *   lib/server-portal.ts    TIERS               0 / 500 / 1,000 / 5,000
 *   lib/pricing.ts          EARN_STAGES_DEFAULT     500 / 1,000 / 5,000
 *   lib/week-tiers.ts       TIERS               0 / 500 / 5,000
 *   lib/server-score.ts     BRACKETS            0 / 500 / 1,000
 *
 * Two of them decided money and they disagreed about the top rung by a factor
 * of five. A server with 2,000 qualified members was shown "Broadcaster", told
 * it was "mid" by the weekly close, and paid out of the LARGE bracket. Nothing
 * failed; three different files were each internally consistent.
 *
 * A test that only checked one of them could never have seen it. So the checks
 * below are about the SHAPE of the codebase as much as the arithmetic: there is
 * one array, no file declares a second, and the pages that quote a threshold
 * import it rather than typing it.
 *
 *   DEMO_DB=1 npx tsx tests/db/ladder.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) => ok(name, got === want, `got ${String(got)}, want ${String(want)}`);
const at = (p: string) => new URL(`../../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");

const {
  RUNGS, EARN_FLOOR, rungOf, rung, earning, nextRung, ladderProgress, ladderBadge, OFF_LADDER,
} = await import("../../lib/ladder.ts");

/** Every .ts/.tsx under a directory, so no guard below depends on a hand-kept file list. */
const walk = (dir: string): string[] => readdirSync(at(dir), { withFileTypes: true })
    .flatMap((e) => e.name.startsWith(".") || e.name === "node_modules"
      ? []
      : e.isDirectory() ? walk(`${dir}/${e.name}`)
        : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);

console.log("== the ladder itself ==");
{
  eq("three rungs", RUNGS.length, 3);
  eq("…at 10, 50 and 100", RUNGS.map((r) => r.threshold).join("/"), "10/50/100");
  eq("…and their shares total 100", RUNGS.reduce((a, r) => a + r.share, 0), 100);
  ok("…in ascending order of threshold",
    RUNGS.every((r, i) => i === 0 || r.threshold > RUNGS[i - 1].threshold));

  // The share goes DOWN as you climb, deliberately. What goes up is the share
  // per server, because fewer servers divide it. If somebody "fixes" this to
  // ascend, the bottom rung — where almost the whole network lives — loses most
  // of its money, and no other test would notice.
  ok("the share DESCENDS as you climb, and that is the design",
    RUNGS.every((r, i) => i === 0 || r.share < RUNGS[i - 1].share),
    RUNGS.map((r) => `${r.key}:${r.share}`).join(" "));

  ok("no rung carries a rate", !RUNGS.some((r) => "ownerPct" in r || "rate" in r || "pct" in r));
  ok("…and every one of them says what it is",
    RUNGS.every((r) => r.name.length > 3 && r.blurb.length > 5 && r.detail.length > 80));
}

console.log("\n== the floor is a real bar, not zero ==");
{
  eq("the floor is the bottom rung's threshold", EARN_FLOOR, RUNGS[0].threshold);
  // The whole point of M3. A bottom rung at 0 is not a rung: everything that
  // fired on "reached a tier" fired for every guild the bot was in, including
  // the payout-holding clock, which read Math.min(...thresholds) and got 0.
  ok("the floor is greater than zero", EARN_FLOOR > 0, String(EARN_FLOOR));
  // …and low. This is the number the whole re-scoping was about: most Discord
  // servers are smaller than the old 500, so the ladder addressed servers that
  // mostly do not exist.
  ok("…and low enough for a 50-member server to reach", EARN_FLOOR <= 10, String(EARN_FLOOR));

  eq("nobody linked is off the ladder", rungOf(0), null);
  eq("one under the floor is still off it", rungOf(EARN_FLOOR - 1), null);
  eq("the floor is on it", rungOf(EARN_FLOOR), RUNGS[0].key);
  eq("earning() agrees at the boundary", earning(EARN_FLOOR - 1), false);
  eq("…and above it", earning(EARN_FLOOR), true);

  // `rungOf` returning null rather than clamping is what makes the gate real.
  // Clamping is how the old bottom tier became meaningless.
  ok("rungOf does not clamp an off-ladder server onto rung 1",
    rung(1) === null && rung(EARN_FLOOR) !== null);
}

console.log("\n== every boundary, on both sides ==");
{
  for (const [i, r] of RUNGS.entries()) {
    eq(`${r.threshold} is ${r.key}`, rungOf(r.threshold), r.key);
    const below = i === 0 ? null : RUNGS[i - 1].key;
    eq(`…and ${r.threshold - 1} is ${below ?? "off the ladder"}`, rungOf(r.threshold - 1), below);
  }
  eq("far above the top is still the top", rungOf(1_000_000), RUNGS[2].key);
}

console.log("\n== what a page renders is never null ==");
{
  // A page still has to draw something for a server with three linked members.
  // Rendering nothing is how "not earning" turns into a blank space an owner
  // reads as a bug.
  ok("an off-ladder server gets the off-ladder card", ladderBadge(0).name === OFF_LADDER.name);
  ok("…and it says what the bar is", OFF_LADDER.blurb.includes(String(EARN_FLOOR)), OFF_LADDER.blurb);
  ok("…and it is a lock, not a badge", OFF_LADDER.icon === "lock");
  ok("an earning server gets its own rung", ladderBadge(EARN_FLOOR).name === RUNGS[0].name);

  // The progress bar. Floored, never rounded: at one short of a rung it must
  // not read 100%, which is the one error a progress bar can make.
  ok("progress off the ladder measures the climb to the floor",
    ladderProgress(EARN_FLOOR - 1).pct < 100 && ladderProgress(EARN_FLOOR - 1).current === null,
    JSON.stringify(ladderProgress(EARN_FLOOR - 1)));
  ok("…and one short of a rung is never 100%",
    ladderProgress(RUNGS[1].threshold - 1).pct < 100,
    String(ladderProgress(RUNGS[1].threshold - 1).pct));
  eq("at the top there is no next rung", nextRung(RUNGS[2].threshold), null);
  eq("…and below the floor the next rung is the first", nextRung(0)?.key, RUNGS[0].key);
}

console.log("\n== nothing declares a second ladder ==");
{
  // THE STRUCTURAL CHECK, and the only one that could have caught the original
  // defect. Every list that is gone is asserted GONE from its module, not
  // merely unused — an exported array nobody reads is one somebody reads again.
  const gone: [string, string][] = [
    ["lib/server-earnings.ts", "EARN_TIERS"],
    ["lib/server-score.ts", "BRACKETS"],
  ];
  for (const [file, name] of gone) {
    const mod = await import(`../../${file}`);
    ok(`${name} is gone from ${file}`, !(name in mod), Object.keys(mod).join(","));
  }
  let removed = true;
  try { await import("../../lib/week-tiers.ts"); removed = false; } catch { /* expected */ }
  ok("lib/week-tiers.ts is deleted, not emptied", removed);

  // And nothing anywhere declares a fresh one. A file that writes its own
  // `threshold:` list of server sizes is the defect coming back; the only place
  // allowed to is the ladder itself.
  const ALLOWED = new Set(["lib/ladder.ts"]);
  const offenders: string[] = [];
  for (const file of [...walk("lib"), ...walk("components")]) {
    if (ALLOWED.has(file)) continue;
    const src = read(file);
    // Two or more `threshold: <number>` literals in one file is a size list.
    // `EarnStage` objects built by mapping RUNGS do not match — they interpolate.
    const literals = src.match(/threshold:\s*\d+/g) ?? [];
    if (literals.length >= 2) offenders.push(`${file} (${literals.join(", ")})`);
  }
  ok("no other module writes its own list of server sizes", offenders.length === 0,
    offenders.join(" · "));

  // ===== AND NOTHING DECLARES A SINGLE ONE EITHER (B1) =====
  //
  // The check above looks for TWO OR MORE `threshold: <number>` literals in one
  // file, on the reasoning that a size LIST is what went wrong before. That is
  // exactly why `DEFAULT_UNLOCK_THRESHOLD = 500` in lib/discord/guilds.ts sat
  // there through the whole consolidation: it is one number, not a list, and it
  // is not spelled `threshold:`.
  //
  // It was not harmless. It is the number the BOT quotes to server owners —
  // "0 / 500 members have joined Cluster and linked a game account", on the one
  // screen an owner reads — while /servers, /pool and the ladder all say the
  // bar is 10. And it is a live gate: `checkUnlock` flips a server to
  // ad-eligible on it, and `networkReach` counts eligible servers by it.
  //
  // So the rule is the strong form: any identifier that NAMES a member
  // threshold, bound to a number, outside lib/ladder.ts. A single constant is
  // caught, whatever it is called and however it is spelled.
  const NAMES = /\b([A-Z][A-Z0-9_]*(?:THRESHOLD|FLOOR|UNLOCK|MIN_MEMBERS)[A-Z0-9_]*)\s*(?::\s*number\s*)?=\s*(\d+)/g;

  // Constants that match the pattern and are NOT a member threshold. Each was
  // read before it was listed, and each carries the reason.
  //
  // An allowlist rather than a narrower regex, deliberately. Narrowing the
  // pattern until these five stopped matching would also stop it matching the
  // next `SOMETHING_FLOOR = 500` about linked members, which is the whole thing
  // being guarded. This fails CLOSED: anything new has to be looked at and
  // named here, and the existence check below deletes entries that go stale.
  const NOT_A_MEMBER_BAR: Record<string, string> = {
    "lib/daily-ceiling.ts:CEILING_FLOOR": "CP per gamer per day, not members",
    "lib/discord/audience.ts:BATCH_FLOOR": "how many suppressed events are worth one message",
    "lib/eligibility.ts:US_REPORT_THRESHOLD": "dollars of earnings that trigger tax reporting",
    "lib/segments.ts:COHORT_FLOOR": "the k-anonymity floor — never describe a group under 25 people",
    // The one genuinely about linked members, and still not this bar: it decides
    // what a passer-by may READ off a public page, not who earns. Its own
    // comment says the two 'happen to agree today' and move for different
    // reasons, which is exactly the argument for keeping them separate.
    "lib/server-public.ts:PUBLIC_FLOOR": "privacy floor for printing a server's linked count",
  };

  // Known, named and TEMPORARY. `DEFAULT_UNLOCK_THRESHOLD` is a live gate on
  // who may carry a sponsored challenge, so moving it to EARN_FLOOR changes who
  // earns — a product decision, not a refactor, and it is with the owner.
  // Measured against production first: 15 active servers, the largest holding 2
  // linked members, so the change moves the eligible count by ZERO today. This
  // entry must be DELETED when the decision lands, and this test fails if the
  // constant is removed while the entry remains — an allowance that outlives
  // its subject is how the last one survived.
  const PENDING: Record<string, string> = {
    "lib/discord/guilds.ts": "DEFAULT_UNLOCK_THRESHOLD",
  };

  const found = new Map<string, string[]>();
  for (const file of [...walk("lib"), ...walk("components"), ...walk("app")]) {
    if (ALLOWED.has(file)) continue;
    const src = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    const hits = [...src.matchAll(NAMES)].map((m) => `${m[1]}=${m[2]}`);
    if (hits.length) found.set(file, hits);
  }

  const unexpected: string[] = [];
  const seen = new Set<string>();
  for (const [file, hits] of found) {
    for (const hit of hits) {
      const name = hit.split("=")[0];
      seen.add(`${file}:${name}`);
      if (PENDING[file] === name) continue;
      if (`${file}:${name}` in NOT_A_MEMBER_BAR) continue;
      unexpected.push(`${file}: ${hit}`);
    }
  }
  ok("no module binds a member threshold to a number of its own", unexpected.length === 0,
    unexpected.join(" · "));

  // Both lists expire with their subjects. An allowance that outlives the thing
  // it excused is how `DEFAULT_UNLOCK_THRESHOLD` survived the consolidation
  // that was supposed to delete it.
  for (const key of Object.keys(NOT_A_MEMBER_BAR)) {
    ok(`the allowance for ${key.split(":")[1]} still describes something real`, seen.has(key),
      `${key} is gone — delete its NOT_A_MEMBER_BAR entry in this file`);
  }
  for (const [file, name] of Object.entries(PENDING)) {
    ok(`the pending exception for ${name} still describes something real`, seen.has(`${file}:${name}`),
      `${name} is gone from ${file} — delete its PENDING entry in this file`);
  }
}

console.log("\n== the surfaces read it rather than retyping it ==");
{
  // The old thresholds, as they appeared in prose. Each of these was a real
  // sentence on a real page: "Link 500 gamers and your server switches on",
  // "At 1,000 linked gamers you become a distribution point".
  //
  // Swept across the WHOLE of lib, components and app rather than a named list
  // of files. The first version of this check listed six files, passed, and
  // missed five more: the landing page said "link 500 gamers", the Discord
  // section said "Hit 500 linked members", `lib/systems.ts` told staff to get
  // owners to 500, and a screenshot manifest still claimed "Owners take 25% at
  // 5,000 linked" — a rate that had been deleted three sprints earlier. A guard
  // with a hand-maintained file list only ever guards the files somebody
  // remembered.
  const STALE = ["500 linked", "1,000 linked", "5,000 linked", "500 gamers",
    "cross 500", "Link 500", "link 500", "500 qualified"];
  const stale: string[] = [];
  for (const p of [...walk("lib"), ...walk("components"), ...walk("app")]) {
    // Comments explaining what the old numbers WERE are the point of the
    // rewrite, not a violation of it. Only live strings count.
    const src = read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    for (const s of STALE) if (src.includes(s)) stale.push(`${p}: "${s}"`);
  }
  ok("nothing anywhere still quotes an old threshold", stale.length === 0, stale.join(" · "));

  // The public ladder cards are BUILT from the rungs rather than parallel to
  // them. This is the file the most people see, and it was the fifth copy.
  const { EARN_STAGES_DEFAULT } = await import("../../lib/pricing.ts");
  eq("the public ladder has one card per rung", EARN_STAGES_DEFAULT.length, RUNGS.length);
  ok("…on exactly the same thresholds",
    EARN_STAGES_DEFAULT.every((s, i) => s.threshold === RUNGS[i].threshold),
    EARN_STAGES_DEFAULT.map((s) => s.threshold).join("/"));
  ok("…and every card states its own rung's number",
    EARN_STAGES_DEFAULT.every((s) => s.detail.includes(String(s.threshold))));
  ok("…and none of them promises a per-challenge rate",
    !EARN_STAGES_DEFAULT.some((s) =>
      /\d+% of (every|what|the) (sponsored )?challenge|your (share|cut)/i.test(
        `${s.detail} ${s.headline} ${s.perks.join(" ")}`)));
}

console.log("\n== the money path reads the same list ==");
{
  const score = read("lib/server-score.ts");
  ok("weekPayouts splits by rung", /RUNGS/.test(score) && /rung\?: RungKey/.test(score));
  ok("…and no bracket array survives in it", !/export const BRACKETS/.test(score));

  const standing = read("lib/week-standing.ts");
  ok("the weekly scoring gates on the floor", /EARN_FLOOR|s\.rung !== null/.test(standing));
  ok("…and says how many it turned away", /skippedUnderFloor/.test(standing));

  // The payout-holding clock. This is the consequence that fired for everybody
  // when the bottom rung was 0.
  const guilds = read("lib/discord/guilds.ts");
  ok("the payout-hold clock starts at the floor, not at zero",
    /EARN_FLOOR/.test(guilds) && !/EARN_TIERS/.test(guilds));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
