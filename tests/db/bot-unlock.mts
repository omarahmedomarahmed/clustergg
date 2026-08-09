// The gate the bot never mentioned. B108.
//
// THE DEFECT: B94 made the three steps a real gate — nothing accrues until a
// gamer has linked a game, confirmed an email, and given an age, a country and
// a card template. B95, B96, B97 and B98 refined it. Every bit of it lived on
// the website.
//
// The bot knew nothing about any of it. A gamer whose entire relationship with
// Cluster is `/cluster` in their own server — which, since `ensureGamerForDiscord`
// makes the account on first use, is EVERY new gamer — saw a Cluster Points
// card footed with "Cluster Points come from quests" while earning exactly zero
// of them, for a reason no screen in the bot ever gave.
//
// That is the worst version of a gate: invisible, on the surface most of our
// gamers actually live on. Nobody concludes "I have three steps left". They
// conclude the product is broken.
//
//   DEMO_DB=1 npx tsx tests/db/bot-unlock.mts

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

const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const raw = readFileSync(new URL("../../lib/discord/screens.ts", import.meta.url), "utf8");
const src = code("lib/discord/screens.ts");

const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { unlockState, tryUnlock, UNLOCK_STEPS, stepsFor } = await import("../../lib/unlock.ts");
const { screenForCommand } = await import("../../lib/discord/screens.ts");

const db = await getDb();

console.log("== the word reaches the screen ==");
{
  eq("`/cluster unlock` opens it", await screenForCommand("unlock"), { screen: "unlock", args: [] });
  // What somebody types when they have been told there is something to do but
  // not what it is called.
  eq("…so does `start`", await screenForCommand("start"), { screen: "unlock", args: [] });
  eq("…and `verify`", await screenForCommand("verify"), { screen: "unlock", args: [] });
  ok("the router actually has a case for it", /case "unlock": return unlockScreen/.test(src));
  ok("…and it is listed in the command help",
    /`\/cluster unlock`/.test(raw),
    "a command nobody is told about is a command nobody types");
  ok("…and reachable from More without being locked",
    /navButton\("Unlock my account", frame\("unlock"\)/.test(src),
    "a gamer who wants to check should not have to be blocked to find it");
}

console.log("\n== the steps are not retyped in the bot ==");
{
  // THE ASSERTION THIS FILE EXISTS FOR. A bot that says "two steps" over a
  // website that asks for three is the screenshot we do not want, and the only
  // way to guarantee they agree is for the bot to have no opinion.
  ok("the screen renders whatever stepsFor returned",
    /state\.steps\s*$|state\.steps\n|\.map\(\(x\) => `\$\{x\.done \? "✅" : "⬜"\} \*\*\$\{x\.label\}\*\*/.test(raw),
    "labels copied into the bot are labels that drift");
  // Scoped to the unlock screen's own body, comments stripped. `linkScreen` has
  // legitimately carried the title "Link a game account" since long before this
  // — the defect would be the UNLOCK screen restating a step's label.
  const body = src.slice(src.indexOf("async function unlockScreen"), src.indexOf("async function questScreen"));
  const labels = stepsFor({ linked: false, email: false, profile: false }).map((x) => x.label);
  for (const label of labels) {
    ok(`"${label}" is not retyped in the unlock screen`, !body.includes(label),
      "the website's wording, pasted, is the website's wording frozen");
  }
  ok("its button labels come from the steps", /const label = \(key: string\) =>/.test(body));
  ok("the count comes from UNLOCK_STEPS", /UNLOCK_STEPS/.test(body));
  ok("…and is never written as a literal three",
    !/three|3 (things|steps)/i.test(body),
    "a number typed twice is a number that disagrees with itself once");
}

console.log("\n== a locked gamer is told, on the two screens they open most ==");
{
  // Scoped to homeScreen's own body. An unscoped match here passed while the
  // button had been moved to the END of home's row — it was matching the CP
  // screen's copy of the same call, which is the whole failure mode of a
  // source assertion written too loosely.
  const home = src.slice(src.indexOf("async function homeScreen"), src.indexOf("async function moreScreen"));
  ok("home fetches the lock state", /lockState\(ctx\),/.test(home));
  ok("…and puts the button FIRST",
    /components: rows\(\[\s*unlockButton\(locked, \[here, \.\.\.trail\]\),/.test(home),
    "rows() truncates from the END — the button explaining why nothing counts must not be the one dropped");
  ok("home's footer says nothing is counting",
    /Nothing is counting yet — \$\{locked\.done\} of \$\{locked\.total\}/.test(raw));
  ok("the CP screen no longer claims points are coming",
    /locked\.locked\s*\?\s*`Nothing is counting yet/.test(raw),
    "\"Cluster Points come from quests\", shown to somebody earning none, is how the product looks broken");
  ok("…and it still says the true thing when unlocked",
    /Cluster Points come from quests — every game you play feeds the same total\./.test(raw));
}

console.log("\n== the button is green, and that is on purpose ==");
{
  ok("the unlock button is not red",
    !/frame\("unlock"\), trail, ButtonStyle\.Danger/.test(src),
    "this file already decided Discord red reads as destructive — the game palette excludes it for that reason");
  ok("…it is green", /frame\("unlock"\), trail, ButtonStyle\.Success/.test(src));
  ok("the label carries the progress",
    /Unlock my account · \$\{l\.done\}\/\$\{l\.total\}/.test(raw),
    "\"Unlock my account\" is a chore; \"· 2/3\" is nearly finished");
  ok("an unlocked gamer gets no button at all", /l\.locked\s*\?[\s\S]{0,200}: null;/.test(src));
}

console.log("\n== against a real gamer, all the way through ==");
const userId = uid();
{
  await db.insert(schema.users).values({
    id: userId,
    displayName: "Bot Unlock Fixture",
    slug: `bot-unlock-${uid().slice(0, 8)}`,
    email: `${uid().slice(0, 10)}@example.test`,
  });

  const fresh = await unlockState(db, userId);
  ok("a brand-new bot account is locked", !fresh.unlocked,
    "ensureGamerForDiscord makes the account on first /cluster — so this is EVERY new gamer");
  eq("…with none of the steps done", fresh.steps.filter((s) => s.done).length, 0);
  eq("…and all of them listed", fresh.steps.length, UNLOCK_STEPS);

  // Step by step, the way the screen counts them.
  await db.insert(schema.linkedGameAccounts).values({
    id: uid(), userId, provider: "riot", providerAccountId: uid(),
    inGameName: "Fixture#EUW", region: "euw",
  });
  eq("linking one account moves the count",
    (await unlockState(db, userId)).steps.filter((s) => s.done).length, 1);

  await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(sqlEq(schema.users.id, userId));
  eq("confirming the email moves it again",
    (await unlockState(db, userId)).steps.filter((s) => s.done).length, 2);

  await db.update(schema.users)
    .set({ country: "EG", ageBand: "adult", theme: { template: "cosmic" } })
    .where(sqlEq(schema.users.id, userId));

  const done = await tryUnlock(db, userId);
  ok("the third finishes it", done.unlocked);
  ok("…and the congratulations names what they DID",
    done.achieved.some((a) => /^You linked /.test(a)),
    "\"you completed onboarding\" congratulates somebody for filling in a form");
  ok("…including the game, not just the step", done.achieved.some((a) => a.includes("riot")));

  // The screen calls the PROMOTING read, so a gamer who finished the last step
  // on the website and came straight back is unlocked by opening the card
  // rather than told they still have one to go.
  ok("the screen uses the promoting read", /await tryUnlock\(db, ctx\.gamer\.userId\)/.test(src));
  ok("…and the cheap non-promoting one for the banner",
    /const st = await unlockState\(await getDb\(\), ctx\.gamer\.userId\)/.test(src),
    "home and CP must not pay for a promotion check on every open");
}

console.log("\n== the banner cannot break a screen ==");
{
  ok("lockState swallows its own failures", /\} catch \{ return off; \}/.test(src),
    "a screen that cannot answer this shows itself without the banner; a screen that 500s shows nothing");
  ok("…and is off for a signed-out viewer", /if \(!ctx\.gamer\) return off;/.test(src));
}

console.log("\n== the held balance is described as safe, never as pending ==");
{
  ok("the held line says it is already theirs",
    /CP is already yours\*\* and none of it goes anywhere/.test(raw));
  // Against the stripped source, not `raw` — the comment above that line
  // explains WHY it must not say "waiting", and a comment containing the word
  // it forbids is not the defect.
  ok("…and never calls it pending or waiting",
    !/pending|waiting|will be released/i.test(src.slice(src.indexOf("async function unlockScreen"), src.indexOf("async function questScreen"))),
    "a number described as waiting reads as a number that might not arrive");
  ok("…and is only shown when there IS one", /state\.heldCp > 0/.test(src));
}

console.log("\n== the two careful facts stay on the site ==");
{
  // An email code and a date of birth are the two things we handle most
  // carefully. They belong on the signed-in site, not in a chat modal in
  // somebody else's server.
  ok("email confirmation links out", /linkButton\(label\("email"\), `\$\{site\}\/onboarding`/.test(src));
  ok("age and country link out", /linkButton\(label\("profile"\), `\$\{site\}\/onboarding`/.test(src));
  ok("but linking a game happens in the bot",
    /navButton\(label\("link"\), frame\("link", ""\)/.test(src),
    "it is the one step a gamer sitting in a Discord server is most ready for");
  ok("…and every label is cut to Discord's button limit",
    /\.slice\(0, 80\)/.test(src),
    "a step label longer than 80 characters is a 400 from Discord, not a long button");
}

// Fixtures out.
await db.delete(schema.linkedGameAccounts).where(sqlEq(schema.linkedGameAccounts.userId, userId));
await db.delete(schema.users).where(sqlEq(schema.users.id, userId));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
