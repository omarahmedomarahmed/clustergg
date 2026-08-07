// B61 — the Daily Mission.
//
// The assertions that matter are the ones that stop a mission being IMPOSSIBLE,
// because an impossible mission is invisible until a gamer is stuck on it:
//
//   * Every variation totals the ceiling EXACTLY, at the live prices. Asserted
//     against `ACTION_CATALOG` rather than against numbers copied into the test,
//     so moving a weight breaks this file instead of silently breaking the
//     product. That is the whole reason the arithmetic is safe to write down.
//   * No task asks for more than that action's daily cap. "Join a challenge x3"
//     with a cap of 2 is a task nobody can finish and nothing about it looks
//     wrong.
//   * A mission is only editable from TOMORROW. Editing today's moves the
//     goalposts under gamers already running at them.
//   * The streak is a LOOP: milestones repeat after a reset.
//
//   DEMO_DB=1 npx tsx tests/db/missions.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const {
  MISSION_TEMPLATES, QUEST_GROUPS, missionTotal, missionByGroup, missionProblems,
  launchable, templateForWeek, weekNumber, editable, nextEditableDay, dayKey,
  parseScheduled, progressOf, parseMilestones, streakFrom, milestonesHit, nextMilestone,
} = await import("../../lib/missions.ts");
const { ACTION_CATALOG, DEFAULT_DAILY_CP_CEILING } = await import("../../lib/quests.ts");

const WEIGHT = new Map(ACTION_CATALOG.map((a) => [a.key, a.defaultWeight]));
const CAP = new Map(ACTION_CATALOG.map((a) => [a.key, a.defaultCap]));

console.log("== every variation is exactly the ceiling, at the LIVE prices ==");
eq("there are four", MISSION_TEMPLATES.length, 4);
eq("…with distinct ids", MISSION_TEMPLATES.length, new Set(MISSION_TEMPLATES.map((t) => t.id)).size);
for (const m of MISSION_TEMPLATES) {
  // Summed from ACTION_CATALOG, not from numbers copied in here: moving a weight
  // has to break this file rather than quietly break the product.
  eq(`"${m.name}" totals ${DEFAULT_DAILY_CP_CEILING}`, missionTotal(m), DEFAULT_DAILY_CP_CEILING);
  const byGroup = missionByGroup(m);
  eq(`…across all four quests`, Object.keys(byGroup).sort(), [...QUEST_GROUPS].sort());
  ok(`…evenly, ${DEFAULT_DAILY_CP_CEILING / 4} each`,
    Object.values(byGroup).every((v) => v === DEFAULT_DAILY_CP_CEILING / 4), JSON.stringify(byGroup));
  eq(`…in eight tasks`, m.tasks.length, 8);
  eq(`…two per quest`, [...new Set(m.tasks.map((t) => ACTION_CATALOG.find((a) => a.key === t.action)?.group))].length, 4);
  ok(`…and it is launchable`, launchable(m));
}

console.log("\n== no task asks for more than the action's cap ==");
// The bug this stops: a task nobody can finish, which looks fine until a gamer
// is stuck on it at midnight.
const over: string[] = [];
for (const m of MISSION_TEMPLATES) {
  for (const t of m.tasks) {
    const cap = CAP.get(t.action) ?? 0;
    if (cap > 0 && t.count > cap) over.push(`${m.id}: ${t.action} x${t.count} > cap ${cap}`);
  }
}
eq("every task is completable", over, []);
// …and the validator says so in the admin's words.
const impossible = missionProblems({ tasks: [{ action: "join_challenge", count: 9 }] });
ok("the editor explains an over-cap task", impossible.some((p) => /capped at/.test(p.message)), JSON.stringify(impossible));
ok("…and an under-total mission", missionProblems({ tasks: [{ action: "join_challenge", count: 1 }] })
  .some((p) => /has to be the whole/.test(p.message)));
ok("…and an OVER-total one, because the cap clamps it and the last tasks pay nothing",
  missionProblems({ tasks: [...MISSION_TEMPLATES[0].tasks, { action: "message_new", count: 3 }] })
    .some((p) => /would pay nothing/.test(p.message)));
ok("…and a retired action, which pays nothing",
  missionProblems({ tasks: [{ action: "write_post", count: 1 }] }).some((p) => /pays nothing/.test(p.message)));
ok("…and the same action listed twice",
  missionProblems({ tasks: [{ action: "join_challenge", count: 1 }, { action: "join_challenge", count: 1 }] })
    .some((p) => /appears twice/.test(p.message)));
eq("a valid mission has nothing to say", missionProblems(MISSION_TEMPLATES[1]), []);

console.log("\n== the retired actions pay nothing, and the new ones are priced ==");
for (const k of ["write_post", "write_comment", "reaction_given", "reaction_received"]) {
  eq(`${k} is retired`, WEIGHT.get(k), 0);
}
for (const k of ["challenge_progress", "play_session", "share_card"]) {
  ok(`${k} exists and pays`, (WEIGHT.get(k) ?? 0) > 0, String(WEIGHT.get(k)));
}
eq("share_card is ORBIT, not ascension", ACTION_CATALOG.find((a) => a.key === "share_card")?.group, "orbit");
// These used to assert gifts were priced symmetrically and capped low, because
// any gap between giving and receiving is an arbitrage a pair of accounts can
// farm. Gifting is deleted (B72.3), so the assertions are INVERTED rather than
// removed — and they had to be, because at weight 0 the old ones still passed:
// 0 === 0 and 1 === 1 are true of a feature that no longer exists. That is the
// vacuous-assertion shape the due-diligence report found in marketplace.mts.
for (const k of ["gift_sent", "gift_received"]) {
  eq(`${k} pays nothing`, WEIGHT.get(k), 0);
  ok(`…and is labelled retired`, /retired/i.test(ACTION_CATALOG.find((a) => a.key === k)?.label ?? ""));
}
ok("no mission variation asks for a gift",
  MISSION_TEMPLATES.every((m) => m.tasks.every((t) => !t.action.startsWith("gift_"))));
// The rebuilt orbit blocks must still total exactly 125 — asserted above for
// every variation, but stated here too because THIS is the change that could
// have broken it.
ok("every rebuilt mission still totals the ceiling",
  MISSION_TEMPLATES.every((m) => missionTotal(m) === DEFAULT_DAILY_CP_CEILING));
ok("adding the bot is repeatable now", (CAP.get("bot_added") ?? 0) >= 2);

console.log("\n== a week picks the mission, and the cycle comes back round ==");
const mon = (n: number) => new Date(Date.UTC(2026, 0, 5 + n * 7, 12));
const seen = [0, 1, 2, 3].map((i) => templateForWeek(mon(i)).id);
eq("four consecutive weeks are four different missions", new Set(seen).size, 4);
eq("…and the fifth is the first again", templateForWeek(mon(4)).id, seen[0]);
eq("the same week is the same mission", templateForWeek(mon(1)).id, templateForWeek(new Date(Date.UTC(2026, 0, 15, 3))).id);
ok("…for everybody", templateForWeek(mon(2)).id === templateForWeek(mon(2)).id);
ok("a week number is stable across a day", weekNumber(mon(0)) === weekNumber(new Date(Date.UTC(2026, 0, 5, 23, 59))));

console.log("\n== admin edits TOMORROW, never today ==");
const now = new Date("2026-03-10T08:00:00Z");
ok("today is not editable", !editable("2026-03-10", now));
ok("…nor is yesterday", !editable("2026-03-09", now));
ok("tomorrow is", editable("2026-03-11", now));
ok("…and so is next week", editable("2026-03-20", now));
eq("the editor opens on tomorrow", nextEditableDay(now), "2026-03-11");
eq("…and the day key is the UTC day, the same boundary the ceiling resets on", dayKey(now), "2026-03-10");

console.log("\n== a day with no edit still has a mission ==");
// A day with no mission is a gamer opening the band to nothing, caused by our
// own missing row.
const auto = parseScheduled(undefined, "2026-03-11");
ok("an unscheduled day falls back to the week's template", auto.tasks.length === 8, JSON.stringify(auto.tasks.length));
eq("…and says it was not edited", auto.edited, false);
eq("…and still totals the ceiling", missionTotal(auto), DEFAULT_DAILY_CP_CEILING);
const broken = parseScheduled({ templateId: "nope", tasks: [{ action: "not_an_action", count: 2 }] }, "2026-03-11");
eq("a malformed row falls back rather than leaving the day empty", broken.tasks.length, 8);
const edited = parseScheduled({
  templateId: "show-up", name: "Launch week", tasks: [{ action: "ad_impression", count: 15 }],
}, "2026-03-11");
eq("an admin's edit is kept", edited.tasks, [{ action: "ad_impression", count: 15 }]);
eq("…and marked as edited", edited.edited, true);
eq("…and remembers what it started from", edited.templateId, "show-up");
eq("…with the count clamped to something sane",
  parseScheduled({ templateId: "show-up", tasks: [{ action: "ad_click", count: 9999 }] }, "2026-03-11").tasks[0].count, 50);

console.log("\n== progress is READ, and the total can be complete with nothing ticked ==");
const m0 = parseScheduled(undefined, dayKey(new Date()));
const none = progressOf(m0, {}, 0);
eq("nothing done is nothing ticked", none.tasks.filter((t) => t.complete).length, 0);
eq("…and not complete", none.complete, false);
// THE case. 500 earned another way is a completed day whose tasks are untouched
// — a true statement rather than a special case anybody has to code.
const elsewhere = progressOf(m0, {}, DEFAULT_DAILY_CP_CEILING);
eq("500 earned elsewhere completes the day", elsewhere.complete, true);
eq("…with no task ticked", elsewhere.tasks.filter((t) => t.complete).length, 0);
const partial = progressOf(m0, { [m0.tasks[0].action]: 99 }, 200);
eq("a task's done count is clamped to what was asked", partial.tasks[0].done, m0.tasks[0].count);
eq("…and it reads complete", partial.tasks[0].complete, true);
ok("every task states what it is worth", partial.tasks.every((t) => t.cp > 0));

console.log("\n== the streak is a LOOP ==");
const days = (list: string[]) => new Set(list);
const at = new Date("2026-03-10T12:00:00Z");
eq("no days is no streak", streakFrom(days([]), at), 0);
eq("today alone is one", streakFrom(days(["2026-03-10"]), at), 1);
eq("three back-to-back is three", streakFrom(days(["2026-03-10", "2026-03-09", "2026-03-08"]), at), 3);
// A day still in progress must not break a streak at 00:01.
eq("today unfinished does not break yesterday's streak",
  streakFrom(days(["2026-03-09", "2026-03-08"]), at), 2);
eq("a gap resets it", streakFrom(days(["2026-03-10", "2026-03-08", "2026-03-07"]), at), 1);

const miles = parseMilestones([{ days: 7, trophyId: "t7" }, { days: 14, trophyId: "t14" }, { days: 3, trophyId: null }]);
eq("milestones sort by day", miles.map((m) => m.days), [3, 7, 14]);
eq("a milestone with no trophy is kept, and awards nothing", miles[0].trophyId, null);
eq("junk is dropped", parseMilestones([{ days: 0 }, { days: 9999 }, "x"]), []);
eq("duplicates are dropped", parseMilestones([{ days: 7, trophyId: "a" }, { days: 7, trophyId: "b" }]).length, 1);

eq("a streak of 7 has passed 3 and 7", milestonesHit(7, miles).map((m) => m.days), [3, 7]);
eq("…and day 8 awards nothing new", milestonesHit(8, miles, [3, 7]).map((m) => m.days), []);
eq("reaching 14 has earned both 7 and 14", milestonesHit(14, miles, [3, 7]).map((m) => m.days), [14]);
// THE rule the design turns on: after a reset, the same milestone pays again.
eq("a FRESH streak awards the same milestone again", milestonesHit(7, miles, []).map((m) => m.days), [3, 7]);
eq("the next one is named with its distance", nextMilestone(4, miles), { milestone: { days: 7, trophyId: "t7" }, away: 3 });
eq("…and past the last there is none", nextMilestone(99, miles), null);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
