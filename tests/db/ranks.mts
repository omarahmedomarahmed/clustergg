/**
 * Rank rules read as ranks.
 *
 * The screenshot that started this said "Gamers will read: At least 9 flex 5v5
 * tier". Three separate things had to be true for that sentence to exist:
 *
 *   1. `rankLabels` was dropped by the admin page's provider mapping, so the
 *      builder never knew the metric had a ladder.
 *   2. The ladder it would have used was a list of NAMES indexed by position,
 *      while the adapter stores `tier * 400 + LP` — so even wired up, every
 *      League rank would have resolved to Challenger.
 *   3. The rule was only ever compared against the DELTA a run produced, so a
 *      rank gate was unsatisfiable by construction and silently scored zero.
 *
 * Each is asserted below against the real registry and the real rules module.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { PROVIDERS, getProvider, lolTierValue, dotaRankLabel } = await import("../../lib/providers/registry.ts");
const {
  isRanked, valueLabel, valueChoices, ruleSentence, ruleLines, meetsRule, unmetRules, RULE_OPS,
} = await import("../../lib/challenge-rules.ts");
const { builderProviders } = await import("../../lib/challenge-builder-data.ts");

const lol = getProvider("riot-lol")!;
const flex = lol.capabilities.find((c) => c.key === "flex_tier")!;
const solo = lol.capabilities.find((c) => c.key === "solo_tier")!;
const dota = getProvider("opendota")!.capabilities.find((c) => c.key === "rank_tier")!;
const faceit = getProvider("faceit")!.capabilities.find((c) => c.key === "skill_level")!;
const wins = getProvider("chesscom")!.capabilities.find((c) => c.key === "wins")!;

try {
  console.log("\n== The ladder reaches the builder ==");
  // The defect: both admin pages rebuilt each capability field by field and
  // both left the ladder out. This is that exact hop.
  const bp = builderProviders().find((p) => p.id === "riot-lol")!;
  const builderFlex = bp.capabilities.find((c) => c.key === "flex_tier")!;
  ok("the builder's copy of a ranked metric still has its ladder",
    isRanked(builderFlex), JSON.stringify(Object.keys(builderFlex)));
  ok("and it is the same ladder, not a reduced one",
    builderFlex.ranks?.length === flex.ranks?.length,
    `${builderFlex.ranks?.length} vs ${flex.ranks?.length}`);
  ok("every provider survives the hop with its ladders intact", builderProviders().every((p) => {
    const src = getProvider(p.id)!;
    return p.capabilities.every((c, i) => isRanked(c) === isRanked(src.capabilities[i]));
  }));

  console.log("\n== League: divisions, and the numbers behind them ==");
  ok("the ladder has every rung the game has", flex.ranks?.length === 31, String(flex.ranks?.length));
  const labels = (flex.ranks ?? []).map((r) => r.label);
  ok("it starts at the bottom", labels[0] === "Iron IV", labels[0]);
  ok("and ends at the top", labels[labels.length - 1] === "Challenger", labels[labels.length - 1]);
  ok("divisions run IV → I inside a tier",
    labels.slice(24, 28).join(",") === "Diamond IV,Diamond III,Diamond II,Diamond I", labels.slice(24, 28).join(","));
  ok("apex tiers have no divisions", labels.filter((l) => /^Master|^Grandmaster|^Challenger/.test(l)).join(",")
    === "Master,Grandmaster,Challenger");
  ok("the ladder only ever goes up",
    (flex.ranks ?? []).every((r, i, a) => i === 0 || r.value > a[i - 1].value));

  // The rung values must be the values a SYNCED account actually holds, or the
  // rule names a rank nobody can be at.
  ok("a rung's value is what the adapter stores for that rank",
    lolTierValue("DIAMOND", "I", 0) === (flex.ranks ?? []).find((r) => r.label === "Diamond I")?.value,
    `${lolTierValue("DIAMOND", "I", 0)}`);
  ok("Gold IV and Gold I are no longer the same number",
    lolTierValue("GOLD", "IV", 50) !== lolTierValue("GOLD", "I", 50),
    `${lolTierValue("GOLD", "IV", 50)} vs ${lolTierValue("GOLD", "I", 50)}`);
  ok("LP can never push a rank past the tier above it",
    lolTierValue("DIAMOND", "I", 99999) < lolTierValue("MASTER", "I", 0),
    `${lolTierValue("DIAMOND", "I", 99999)} vs ${lolTierValue("MASTER", "I", 0)}`);
  ok("an unranked/unknown tier is the floor", lolTierValue("", null, 0) === 0);

  console.log("\n== A stored value reads back as the rank it is ==");
  ok("Gold II on 40 LP reads Gold II",
    valueLabel(solo, lolTierValue("GOLD", "II", 40)) === "Gold II",
    valueLabel(solo, lolTierValue("GOLD", "II", 40)));
  ok("Challenger reads Challenger",
    valueLabel(solo, lolTierValue("CHALLENGER", "I", 1200)) === "Challenger",
    valueLabel(solo, lolTierValue("CHALLENGER", "I", 1200)));
  ok("Iron IV on 0 LP reads Iron IV",
    valueLabel(solo, 0) === "Iron IV", valueLabel(solo, 0));
  // The old code indexed the label list by the stored value, so ANY real League
  // value clamped to the last name.
  ok("a mid-ladder value is NOT read as the top rank",
    valueLabel(solo, lolTierValue("SILVER", "III", 20)) !== "Challenger",
    valueLabel(solo, lolTierValue("SILVER", "III", 20)));

  console.log("\n== The sentence a gamer reads ==");
  const sentence = ruleSentence({ metric: "flex_tier", op: ">=", value: lolTierValue("DIAMOND", "I", 0) }, flex);
  ok("names the rank, with the operator first", sentence === "At least Diamond I in Flex 5v5 tier", sentence);
  ok("and contains no digits at all", !/\d/.test(sentence.replace("5v5", "")), sentence);
  const exact = ruleSentence({ metric: "solo_tier", op: "==", value: lolTierValue("GOLD", "IV", 0) }, solo);
  ok("`exactly` reads as exactly", exact === "Exactly Gold IV in Solo/Duo tier", exact);
  ok("a metric with no ladder still reads as a number",
    ruleSentence({ metric: "wins", op: ">=", value: 50 }, wins) === "At least 50 total wins",
    ruleSentence({ metric: "wins", op: ">=", value: 50 }, wins));
  ok("the operator wording is one set, used by builder and card",
    RULE_OPS.every((o) => typeof o.label === "string" && o.label.length > 0));

  console.log("\n== Every game's own ladder, in its own words ==");
  ok("Dota reads medals and stars",
    valueLabel(dota, 55) === "Legend 5" && valueLabel(dota, 80) === "Immortal",
    `${valueLabel(dota, 55)} / ${valueLabel(dota, 80)}`);
  ok("its rungs are OpenDota's own rank_tier numbers",
    (dota.ranks ?? []).find((r) => r.label === "Ancient 3")?.value === 63,
    String((dota.ranks ?? []).find((r) => r.label === "Ancient 3")?.value));
  ok("the profile label and the ladder label agree",
    dotaRankLabel(63) === valueLabel(dota, 63), `${dotaRankLabel(63)} vs ${valueLabel(dota, 63)}`);
  ok("FACEIT reads levels", valueLabel(faceit, 7) === "Level 7", valueLabel(faceit, 7));
  ok("FACEIT has exactly ten", faceit.ranks?.length === 10, String(faceit.ranks?.length));

  console.log("\n== A number box only where the game has no names ==");
  const ranked = PROVIDERS.flatMap((p) => p.capabilities).filter(isRanked);
  ok("some metrics are ranked", ranked.length >= 4, String(ranked.length));
  ok("every ranked metric offers choices, so none can render a spinner",
    ranked.every((m) => valueChoices(m).length > 0));
  ok("every rung is labelled with something a person would recognise",
    ranked.every((m) => (m.ranks ?? []).every((r) => /[A-Za-z]/.test(r.label))));
  ok("a rating still gets a number box", valueChoices(wins).length === 0);

  console.log("\n== The gate gates ==");
  const gold = lolTierValue("GOLD", "II", 40);
  const diamond = lolTierValue("DIAMOND", "I", 0);
  const rule = { metric: "flex_tier", op: ">=", value: diamond };
  ok("a Gold account fails a Diamond rule", !meetsRule(rule, gold));
  ok("a Diamond account passes it", meetsRule(rule, diamond));
  ok("a Challenger account passes it", meetsRule(rule, lolTierValue("CHALLENGER", "I", 800)));
  ok("`exactly` means exactly",
    meetsRule({ metric: "x", op: "==", value: 5 }, 5) && !meetsRule({ metric: "x", op: "==", value: 5 }, 6));

  const unmet = unmetRules([rule], { flex_tier: gold }, lol.capabilities);
  ok("the failure is reported as the rank they need",
    unmet.length === 1 && unmet[0] === "At least Diamond I in Flex 5v5 tier", unmet.join(" | "));
  ok("an account that qualifies has nothing unmet",
    unmetRules([rule], { flex_tier: diamond }, lol.capabilities).length === 0);
  // An account that has never synced must FAIL a rank floor, not slip under it.
  ok("an unsynced account fails a rank floor",
    unmetRules([rule], {}, lol.capabilities).length === 1);
  ok("a challenge with no rules is open to everyone",
    unmetRules([], { flex_tier: 0 }, lol.capabilities).length === 0);

  console.log("\n== The card and the page say the same thing ==");
  const lines = ruleLines([rule, { metric: "wins", op: ">=", value: 10 }], lol.capabilities);
  ok("every rule becomes a line", lines.length === 2, lines.join(" | "));
  ok("the ranked line names the rank", lines[0] === "At least Diamond I in Flex 5v5 tier", lines[0]);
  ok("an unknown metric degrades to its key rather than throwing",
    ruleLines([{ metric: "nope", op: ">=", value: 1 }], lol.capabilities)[0] === "At least 1 nope",
    ruleLines([{ metric: "nope", op: ">=", value: 1 }], lol.capabilities)[0]);
} catch (e) {
  fail++;
  console.log("  ✗ threw:", (e as Error).message);
  console.log((e as Error).stack?.split("\n").slice(1, 4).join("\n"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
