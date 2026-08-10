/**
 * Streak milestones can actually be set. B122.
 *
 * ===== THE BUG THIS CLOSES, AND WHY IT WAS INVISIBLE =====
 *
 * `missions.milestones` was READ by the nightly award job and by the mission
 * band in the nav, and WRITTEN by nothing. There was no screen, no action, no
 * path of any kind that could set it.
 *
 * Nothing failed. `DEFAULT_MILESTONES` ships four rungs with `trophyId: null`,
 * the band honestly prints "Trophies for these are being chosen", and
 * `awardStreakMilestones` skips a rung with no trophy — so a gamer could run a
 * thirty-day streak, watch four rungs light up and receive nothing, forever,
 * and every suite stayed green.
 *
 * That is the shape worth naming: a setting with a reader and no writer is not
 * a broken feature, it is a feature that quietly never starts. `tests/db/
 * mission-live.mts` covers the reader thoroughly and could not have caught it.
 *
 *   DEMO_DB=1 npx tsx tests/db/milestones-admin.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const { parseMilestones } = await import("../../lib/missions.ts");
const { MILESTONES_KEY, DEFAULT_MILESTONES } = await import("../../lib/mission-live.ts");

console.log("== the setting has a writer at all ==");
{
  // The whole point. Asserted against the source rather than by calling the
  // action, because the failure mode was ABSENCE — and an action nothing
  // renders is the same bug one step later.
  const act = read("app/actions/milestones.ts");
  ok("an action writes the milestones setting",
    /platformSettings/.test(act) && new RegExp(MILESTONES_KEY.replace(".", "\\.")).test(act));
  ok("…behind a staff guard", /requireStaff\(\)/.test(act),
    "a setting that changes what gamers are paid is not an open endpoint");
  ok("…and it writes an audit row", /auditLog/.test(act));

  const panel = read("components/MilestonesPanel.tsx");
  ok("a panel calls it", /saveMilestones/.test(panel));
  const desk = read("app/admin/quests/page.tsx");
  ok("…and the panel is actually rendered", /<MilestonesPanel/.test(desk),
    "a component nobody renders is the same gap in a new place");
}

console.log("\n== the action validates with the READER's parser ==");
{
  // A row this action accepts and the band silently drops is the next version
  // of the same defect. Both sides run `parseMilestones`, so the check here is
  // that the action imports it rather than inventing its own rules.
  const act = read("app/actions/milestones.ts");
  ok("it parses with parseMilestones", /parseMilestones/.test(act),
    "validating twice, differently, is how a screen starts lying");

  // And the parser really is strict about the things a form can produce.
  ok("a day of zero is dropped", parseMilestones([{ days: 0, trophyId: null }]).length === 0);
  ok("a day past a year is dropped", parseMilestones([{ days: 400, trophyId: null }]).length === 0);
  ok("a duplicate day is dropped",
    parseMilestones([{ days: 7, trophyId: null }, { days: 7, trophyId: null }]).length === 1);
  ok("a fractional day is floored", parseMilestones([{ days: 7.9, trophyId: null }])[0]?.days === 7);
  ok("rows come back sorted",
    parseMilestones([{ days: 30, trophyId: null }, { days: 3, trophyId: null }])
      .map((m) => m.days).join(",") === "3,30");
  ok("a malformed trophy id becomes null, not a crash",
    parseMilestones([{ days: 3, trophyId: "../etc/passwd" } as never])[0]?.trophyId === null);
}

console.log("\n== a rung with no trophy stays legal ==");
{
  // Not a half-configured state to be rejected. A visible rung with no prize
  // still marks the run, and the band says so rather than implying a prize.
  const kept = parseMilestones(DEFAULT_MILESTONES);
  ok("the shipped default survives its own parser", kept.length === DEFAULT_MILESTONES.length);
  ok("…and every rung of it pays nothing yet", kept.every((m) => m.trophyId === null));

  const panel = read("components/MilestonesPanel.tsx");
  ok("the panel offers 'no trophy' as a choice", /No trophy/.test(panel));
  ok("…and labels which rows pay", /pays out/.test(panel) && /marker only/.test(panel),
    "an operator should be told the difference on the row, not in a legend");
}

console.log("\n== an empty list is a decision, not a missing row ==");
{
  // The subtle one. `currentMilestones` falls back to the default only when
  // there is NO row — an operator who deliberately saved zero milestones must
  // not have four reappear on the next page load.
  const act = read("app/actions/milestones.ts");
  ok("the fallback keys on the row's absence, not its emptiness",
    /row \? stored : DEFAULT_MILESTONES/.test(act),
    "falling back on an empty list would overwrite 'switch this off' every time");
}

console.log("\n== the award path can now pay something ==");
{
  const { getDb, schema } = await import("../../lib/db/index.ts");
  const { awardStreakMilestones } = await import("../../lib/mission-live.ts");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();

  const [trophy] = await db.select().from(schema.trophies).limit(1);
  ok("the demo database has a trophy to attach", !!trophy);

  if (trophy) {
    // Set a rung at one day and give it a real trophy — the exact thing that
    // was impossible before this action existed.
    const value = [{ days: 1, trophyId: trophy.id }];
    await db.insert(schema.platformSettings)
      .values({ key: MILESTONES_KEY, value })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value, updatedAt: new Date() },
      });

    const [stored] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings).where(eq(schema.platformSettings.key, MILESTONES_KEY)).limit(1);
    const back = parseMilestones(stored?.value);
    ok("it round-trips through the setting", back.length === 1 && back[0].trophyId === trophy.id,
      JSON.stringify(back));

    // And the reader picks it up. A gamer with no streak awards nothing, which
    // is the honest outcome — what matters is that it no longer SKIPS for want
    // of a trophy id.
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    if (user) {
      const out = await awardStreakMilestones(db, user.id);
      ok("the award path runs against a configured ladder", Array.isArray(out),
        JSON.stringify(out).slice(0, 120));
      ok("…and nothing it returns is skipped for a missing trophy",
        out.every((a) => a.trophyId !== null || a.awarded === false),
        JSON.stringify(out).slice(0, 120));
    }
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
