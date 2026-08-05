// B1 — the spam audit.
//
// The reported bug was one line: `announceAccountLinked` posted to every
// opted-in server on the network when one person linked one account, from a
// floating promise. At three servers that reads as a lively product. At three
// hundred it is a stranger's name in everybody's channel, and it is the single
// fastest way to get the bot removed.
//
// The audience half was already fixed by the time I got here — the function
// scopes to `guildsOf(userId)`. But it was fixed by REMEMBERING TO, and the
// next announcement somebody adds has nothing stopping it repeating the
// mistake. So this suite checks three things:
//
//   1. Every exported announcement DECLARES its audience. A new one cannot be
//      added without answering the question, because this test walks the module
//      and fails on anything missing from the table.
//   2. Anything personal is THEIR_SERVERS or DIRECT. Never network.
//   3. Correctly scoped is not the same as bearable — the cooldown holds.
//
//   DEMO_DB=1 npx tsx tests/db/spam-audit.mts

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
  ANNOUNCEMENT_AUDIENCE, PERSONAL_AUDIENCES, AUDIENCES, applyCooldown, batchLine,
  windowKey, cooldownFor, BATCH_FLOOR,
} = await import("../../lib/discord/audience.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
const tag = uid().slice(0, 6);

console.log("== every announcement declares who it is for ==");
const src = await readFile(new URL("../../lib/discord/announce.ts", import.meta.url), "utf8");
const exported = [...src.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
ok("the module exports announcements", exported.length > 3, JSON.stringify(exported));
const undeclared = exported.filter((fn) => !ANNOUNCEMENT_AUDIENCE[fn]);
// THE assertion that keeps this true. Adding an announcement without filing it
// fails here rather than shipping unscoped.
eq("none is missing from the policy table", undeclared, []);
// …and the table has no entries for functions that no longer exist, which is
// how a policy quietly stops describing the code.
const stale = Object.keys(ANNOUNCEMENT_AUDIENCE).filter((fn) => !exported.includes(fn));
eq("…and the table names nothing that is gone", stale, []);
ok("every declared audience is a real bucket",
  Object.values(ANNOUNCEMENT_AUDIENCE).every((a) => !!AUDIENCES[a.audience]));

console.log("\n== anything personal goes to THEIR servers, never the network ==");
const personal = Object.entries(ANNOUNCEMENT_AUDIENCE).filter(([, a]) => a.personal);
ok("there are personal announcements", personal.length >= 3, JSON.stringify(personal.map(([k]) => k)));
const leaks = personal.filter(([, a]) => !PERSONAL_AUDIENCES.includes(a.audience));
eq("none of them is NETWORK", leaks.map(([k]) => k), []);

// And the code agrees with the table: each personal one scopes to the gamer's
// own servers before it posts. Checked in the source, because the table is a
// claim and this is the thing that makes it true.
for (const [fn] of personal) {
  const body = src.slice(src.indexOf(`export async function ${fn}`),
    src.indexOf("export ", src.indexOf(`export async function ${fn}`) + 10) || undefined);
  ok(`${fn} resolves the gamer's own servers`, /guildsOf\(userId\)/.test(body), body.slice(0, 120));
  ok(`…and posts only to those`, /only: gate\.allowed/.test(body), body.slice(-160));
}

console.log("\n== the reported line is no longer floating ==");
// `void …catch(() => {})` looks safe and is not: a floating promise in a server
// action is killed when the response is sent, so the announcement sometimes
// happened and sometimes did not depending on how fast the caller returned.
const link = await readFile(new URL("../../lib/link-account.ts", import.meta.url), "utf8");
ok("nothing is voided into the background", !/void announceAccountLinked/.test(link));
ok("…it is awaited", /await announceAccountLinked/.test(link));
ok("…and its failure still cannot fail the link",
  /catch \{ \/\* the link stands/.test(link));

console.log("\n== the cooldown holds, per server per kind ==");
const guildA = `sa-${uid().slice(0, 8)}`;
const guildB = `sa-${uid().slice(0, 8)}`;
ok("account_linked has a cooldown", cooldownFor("account_linked") > 0, String(cooldownFor("account_linked")));

const first = await applyCooldown("account_linked", [guildA, guildB], `Gamer1-${tag}`);
eq("the first event reaches both servers", first.allowed.sort(), [guildA, guildB].sort());
eq("…and suppresses nothing", first.suppressed, []);

const second = await applyCooldown("account_linked", [guildA, guildB], `Gamer2-${tag}`);
eq("the second reaches nobody", second.allowed, []);
eq("…and is counted against both", second.suppressed.map((s) => s.total), [1, 1]);

const third = await applyCooldown("account_linked", [guildA], `Gamer3-${tag}`);
eq("a third is counted too", third.suppressed.map((s) => s.total), [2]);
// The names are kept for the batch message, capped — this is a message, not a log.
const [row] = await db.select({ names: schema.discordPostLog.names, suppressed: schema.discordPostLog.suppressed })
  .from(schema.discordPostLog)
  .where(and(sqlEq(schema.discordPostLog.guildId, guildA),
    sqlEq(schema.discordPostLog.windowKey, windowKey("account_linked")))).limit(1);
eq("the window counted two suppressed", Number(row.suppressed), 2);
ok("…and remembers who they were", (row.names ?? []).length >= 2, JSON.stringify(row.names));
ok("…capped at a dozen", (row.names ?? []).length <= 12);

console.log("\n== a kind with no cooldown is not throttled ==");
// Challenge launches are not spam, and throttling them into silence would be a
// worse bug than the one this file is about.
eq("challenge_launched has no cooldown", cooldownFor("challenge_launched"), 0);
const free = await applyCooldown("challenge_launched", [guildA, guildB], null);
eq("…so everything passes", free.allowed.sort(), [guildA, guildB].sort());
const freeAgain = await applyCooldown("challenge_launched", [guildA, guildB], null);
eq("…every time", freeAgain.allowed.length, 2);

console.log("\n== one server's cooldown is not another's ==");
const guildC = `sa-${uid().slice(0, 8)}`;
const fresh = await applyCooldown("account_linked", [guildC], `Gamer4-${tag}`);
eq("a server that has not posted this window still receives", fresh.allowed, [guildC]);

console.log("\n== the batch message says what was swallowed ==");
eq("below the floor there is nothing worth saying", batchLine("account_linked", BATCH_FLOOR - 1, ["A"]), null);
const line = batchLine("account_linked", 4, ["Nova", "Lyra", "Orion"]);
ok("above it, one message", !!line, String(line));
ok("…counting them", /\*\*4\*\*/.test(line ?? ""), String(line));
ok("…naming them", /Nova, Lyra, Orion/.test(line ?? ""), String(line));
ok("…in the gamer's terms, not ours", /linked a game account/.test(line ?? ""), String(line));
const many = batchLine("account_linked", 30, Array.from({ length: 20 }, (_, i) => `G${i}`));
ok("a long list is truncated with a count", /and \d+ more/.test(many ?? ""), String(many));

console.log("\n== a broken cooldown does not silence the bot ==");
// Failing the other way turns one bad query into a bot that has gone quiet,
// which is the harder failure to notice. The catch returns everything allowed.
const budgetSrc = await readFile(new URL("../../lib/discord/audience.ts", import.meta.url), "utf8");
ok("the catch allows rather than suppresses",
  /catch \{[\s\S]{0,220}return \{ allowed: guildIds, suppressed: \[\] \}/.test(budgetSrc));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
