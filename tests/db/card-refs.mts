// B58 — what each pane pulls, and who decides.
//
// The three failures this suite exists to stop, each of which would be found in
// production and none of which a typecheck can see:
//
//   1. **A pane with no reference blanks the card.** Every source has a
//      fallback that is what the card already did, so an unconfigured pane draws
//      what it drew before. A registry whose default is "nothing" turns the
//      layout screen into a way to empty a card by opening it.
//   2. **A reference to a deleted row blanks the card.** A challenge an admin
//      named and then cancelled must fall back, not leave a hole.
//   3. **A gamer's override reaches somebody else's data.** The selection is a
//      FILTER over rows already fetched for them. If it were ever a query, an id
//      typed into it would be an account enumeration.
//
//   DEMO_DB=1 npx tsx tests/db/card-refs.mts

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
  REF_SOURCES, DEFAULT_REFS, sourceById, parseRefs, refFor,
  parseGamerPrefs, narrow, hidden,
} = await import("../../lib/cards/refs.ts");
const { parseLayout } = await import("../../lib/cards/layout.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
const tag = uid().slice(0, 6);

console.log("== the registry is a list of choices an admin would recognise ==");
ok("there are sources", REF_SOURCES.length > 3, String(REF_SOURCES.length));
eq("…with no duplicate ids", REF_SOURCES.length, new Set(REF_SOURCES.map((s) => s.id)).size);
ok("…every one of them named for what it DOES", REF_SOURCES.every((s) => s.label && s.note));
ok("…and the ones that take ids say so", REF_SOURCES.some((s) => s.picks));

console.log("\n== an unset reference draws what the card already drew ==");
// The failure this stops: a layout screen that empties a card by being opened.
const planet = parseRefs(undefined, "planet");
eq("a planet with nothing configured still has its boards", planet.boards?.source, "boards.auto");
eq("…its challenges", planet.challenges?.source, "challenges.live");
eq("…and its world", planet.world?.source, "world.auto");
eq("an unknown KIND is simply empty, not a throw", parseRefs(undefined, "search" as never), {});
eq("a part nobody set falls back", refFor({}, "planet", "boards").source, "boards.auto");
eq("…and a part with no default is blank rather than a guess", refFor({}, "planet", "nope").source, "");

console.log("\n== an unknown or renamed source falls back, it does not blank ==");
const renamed = parseRefs({ boards: { source: "boards.fromTheOldScreen" } }, "planet");
eq("a source that no longer exists reverts to the default", renamed.boards?.source, "boards.auto");
eq("…and a real one is kept", parseRefs({ boards: { source: "boards.pick", ids: ["abc"] } }, "planet").boards?.source, "boards.pick");
ok("an unknown source resolves to nothing", sourceById("nope") === null);

console.log("\n== what an admin types never reaches a query ==");
// B54's rule: a card cannot be taken down from the layout screen.
const dirty = parseRefs({
  boards: { source: "boards.pick", ids: ["good-id_1", "'; drop table users;--", "", "x".repeat(200), "sp ace", "ok2"] },
}, "planet");
eq("only id-shaped values survive", dirty.boards?.ids, ["good-id_1", "ok2"]);
const many = parseRefs({ boards: { source: "boards.pick", ids: Array.from({ length: 40 }, (_, i) => `id${i}`) } }, "planet");
ok("…and the list is capped", (many.boards?.ids ?? []).length <= 12, String((many.boards?.ids ?? []).length));
eq("a source that takes no ids carries none",
  parseRefs({ boards: { source: "boards.auto", ids: ["abc"] } }, "planet").boards?.ids, undefined);
const badPart = parseRefs({ "../../etc": { source: "boards.auto" } }, "planet");
ok("a part key that is not a part is ignored", !("../../etc" in badPart));

console.log("\n== the layout carries the references through its own validator ==");
// One definition of valid, which is the lesson `parseLayout` already learned.
const stored = parseLayout(JSON.stringify({ refs: { world: { source: "world.pick", ids: ["a1", "!!"] } } }), "planet");
eq("a saved reference survives the round trip", stored.refs?.world?.source, "world.pick");
eq("…cleaned", stored.refs?.world?.ids, ["a1"]);
eq("…and the parts nobody touched keep their defaults", stored.refs?.boards?.source, "boards.auto");
const layoutSrc = await readFile(new URL("../../lib/cards/layout.ts", import.meta.url), "utf8");
ok("the layout parser delegates rather than reimplementing", /refs: parseRefs\(o\.refs/.test(layoutSrc));

console.log("\n== a gamer narrows their OWN card, and can do nothing else ==");
const meId = uid();
const themId = uid();
for (const [id, slug] of [[meId, `refs-me-${tag}`], [themId, `refs-them-${tag}`]] as [string, string][]) {
  await db.insert(schema.users).values({
    id, slug, displayName: slug, email: `${id}@test.invalid`, passwordHash: "x",
  } as never);
}
const mine = [{ id: "acc-mine-1" }, { id: "acc-mine-2" }, { id: "acc-mine-3" }];

eq("no selection means all of theirs", narrow(mine, undefined).length, 3);
eq("an empty selection means all of theirs", narrow(mine, []).length, 3);
eq("a selection keeps only what they picked", narrow(mine, ["acc-mine-2"]).map((a) => a.id), ["acc-mine-2"]);
// THE security assertion. The selection is a filter over rows already fetched
// for this gamer, so an id belonging to somebody else selects nothing.
eq("an id they do not own selects nothing of anybody else's",
  narrow(mine, ["acc-SOMEBODY-ELSE"]).map((a) => a.id), mine.map((a) => a.id));
ok("…because it is a FILTER, never a query",
  /rows\.filter\(\(r\) => want\.has\(r\.id\)\)/.test(await readFile(new URL("../../lib/cards/refs.ts", import.meta.url), "utf8")));
// A stale pick — they unlinked the account they had chosen — falls back to
// everything rather than showing them an empty card for our own stale row.
eq("a selection that matches nothing falls back", narrow(mine, ["gone"]).length, 3);

console.log("\n== the gamer's prefs are parsed like everything else ==");
const prefs = parseGamerPrefs({ accounts: ["a1", "bad id", ""], hide: ["trophies"], showOnProfile: false });
eq("ids are cleaned", prefs.accounts, ["a1"]);
eq("hidden sections are kept", prefs.hide, ["trophies"]);
eq("…and the profile switch is read", prefs.showOnProfile, false);
eq("an absent switch defaults to ON", parseGamerPrefs({}).showOnProfile, true);
ok("a hidden section reads as hidden", hidden(prefs, "trophies"));
ok("…and an untouched one does not", !hidden(prefs, "accounts"));

console.log("\n== the card actually honours it, end to end ==");
// Not the model in isolation: the real loader, against real rows.
const accIds = [uid(), uid(), uid()];
for (const [i, id] of accIds.entries()) {
  await db.insert(schema.linkedGameAccounts).values({
    id, userId: meId, provider: "chesscom", providerAccountId: `ref-${tag}-${i}`,
    inGameName: `RefTag${i}${tag}`, verified: true,
  } as never);
}
const { profileCard } = await import("../../lib/cards/data.ts");
const all = await profileCard(`refs-me-${tag}`) as { accounts?: { tag: string }[] };
eq("with no choice, every account is on the card", all.accounts?.length, 3);

await db.update(schema.users).set({ cardPrefs: { accounts: [accIds[1]] } } as never)
  .where(sqlEq(schema.users.id, meId));
const picked = await profileCard(`refs-me-${tag}`) as { accounts?: { tag: string }[] };
eq("with a choice, only that one is", picked.accounts?.map((a) => a.tag), [`RefTag1${tag}`]);

// The one that matters: their choice cannot name somebody else's row.
const theirAcc = uid();
await db.insert(schema.linkedGameAccounts).values({
  id: theirAcc, userId: themId, provider: "chesscom", providerAccountId: `ref-other-${tag}`,
  inGameName: `NotYours${tag}`, verified: true,
} as never);
await db.update(schema.users).set({ cardPrefs: { accounts: [theirAcc] } } as never)
  .where(sqlEq(schema.users.id, meId));
const stolen = await profileCard(`refs-me-${tag}`) as { accounts?: { tag: string }[] };
ok("naming another gamer's account shows none of theirs",
  !(stolen.accounts ?? []).some((a) => a.tag.includes("NotYours")), JSON.stringify(stolen.accounts));
eq("…and falls back to their own", stolen.accounts?.length, 3);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
