// Sprint 4 — the fork, the two paths, and the progress bar.
//
// ===== WHAT THIS SUITE IS ACTUALLY GUARDING =====
//
// One derivation now answers two different questions — *what does a gamer
// still owe us* and *what does a server owner still owe us* — and 12 §2 says
// they differ in exactly one step: the owner path substitutes the `guilds`
// scope for the linked game account (G1). A single wrong list makes one of two
// mistakes, and neither is visible on screen:
//
//   · an owner blocked forever on a game account for a game they do not play
//   · a gamer let through with no game account at all, into a challenge they
//     cannot be scored in
//
// The second one is the expensive one, which is why `path` defaults to the
// **stricter** list and there is an assertion below whose only job is to go red
// if somebody flips that default.
//
// Every assertion here was written by asking *can this fail*, not *is this
// true*. Where the answer was "no — a guard three layers down makes it
// impossible", the claim is a comment instead of an `ok()`.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import {
  deriveUnlock,
  stepsFor,
  GAMER_STEPS,
  OWNER_STEPS,
  ONBOARDING_PATHS,
  type OnboardingPath,
} from "../../lib/identity/unlock.ts";
import { progressOf } from "../../lib/identity/onboarding.ts";
import { discordAuthUrl } from "../../lib/auth/discord.ts";
import { registerGuild } from "../../lib/discord/guilds.ts";
import { recordGuildOwnership } from "../../lib/discord/ownership.ts";
import { eq as sqlEq } from "drizzle-orm";

/** Everything answered except the last step of each path. */
const ANSWERED = { ageBand: "adult", country: "GB" } as const;

test("the two paths differ in exactly one step, and it is the last one", () => {
  eq(GAMER_STEPS.length, OWNER_STEPS.length, "both paths are the same length");
  eq<readonly string[]>(
    GAMER_STEPS.slice(0, -1),
    OWNER_STEPS.slice(0, -1),
    "I8 — both paths ask age band and country, in that order",
  );
  eq(GAMER_STEPS[GAMER_STEPS.length - 1], "link", "the gamer path ends at a linked game account");
  eq(OWNER_STEPS[OWNER_STEPS.length - 1], "guilds", "and the owner path at the guilds scope");
});

test("age band is the first step on every path, because it gates storing anything", () => {
  // I7. Not a layout preference — the step that comes first is the step that
  // is asked first, and everything after it writes to `users`.
  for (const path of ONBOARDING_PATHS) {
    eq(stepsFor(path)[0], "ageBand", `${path} is asked their age before anything is stored`);
  }
  ok(ONBOARDING_PATHS.length > 1, "and there is more than one path, so that loop asserted twice");
});

test("an owner is never blocked on a game account, and a gamer never on guilds", () => {
  const owner = deriveUnlock({
    ...ANSWERED,
    linkedAccountCount: 0,
    path: "owner",
    guildsGranted: true,
  });
  ok(owner.unlocked, "an owner who plays none of our games is unlocked — 12 §2, a capability gate");

  const gamer = deriveUnlock({
    ...ANSWERED,
    linkedAccountCount: 1,
    path: "gamer",
    guildsGranted: false,
  });
  ok(gamer.unlocked, "and a gamer who manages no server is never asked about one");

  // The other direction, which is where a shared list would show up.
  const ownerNoGrant = deriveUnlock({ ...ANSWERED, linkedAccountCount: 5, path: "owner" });
  eq(ownerNoGrant.missing, ["guilds"], "five linked accounts do not answer the owner's step");
  const gamerNoLink = deriveUnlock({
    ...ANSWERED,
    linkedAccountCount: 0,
    path: "gamer",
    guildsGranted: true,
  });
  eq(gamerNoLink.missing, ["link"], "and granting guilds does not answer the gamer's");
});

test("the default path is the stricter one", () => {
  // ===== THE ASSERTION THAT CATCHES A ONE-WORD MISTAKE =====
  //
  // `path` is a cookie. A request that arrives without one — expired, cleared,
  // a direct API call — lands on the default, and the default has to be the
  // list that requires MORE. Flipping `facts.path ?? "gamer"` to `"owner"` is a
  // seven-character edit that lets somebody with no game account into the entry
  // chain, and nothing else on the branch would notice.
  //
  // `guildsGranted: true` is what makes this discriminating: without it both
  // defaults refuse, and this test would be true and unable to fail.
  const unspecified = deriveUnlock({ ...ANSWERED, linkedAccountCount: 0, guildsGranted: true });
  no(unspecified.unlocked, "no path given means the gamer list, which still wants a game account");
  eq(unspecified.path, "gamer", "and the state says which list it used");
  eq(unspecified.missing, ["link"], "naming the step the stricter list is missing");
});

test("stepsFor falls back to the gamer list for anything that is not the owner path", () => {
  // The cookie is attacker-controlled, and `currentPath` already rejects a
  // value that is not one of the two. This is the second half of that: if the
  // reader is ever loosened, the *shape* of `stepsFor` still has to fail safe.
  // Written through `as` because the type system is exactly what is absent at
  // the point a cookie is read.
  const junk = "administrator" as unknown as OnboardingPath;
  eq(stepsFor(junk), GAMER_STEPS, "a path we do not recognise gets the list that asks for more");
});

test("switching path keeps every answer both paths share", () => {
  // I9 — either path always says they can be the other one too, at any time.
  // Two of the three answers are common (I8), so a switch must cost nothing but
  // the last step. This is the guard on the fork being a preference rather than
  // a role: if the path were ever stored on `users` and the switch rewrote the
  // row, this is what would go red.
  const asGamer = deriveUnlock({ ...ANSWERED, linkedAccountCount: 1, path: "gamer" });
  ok(asGamer.unlocked, "finished as a gamer");

  const switched = deriveUnlock({ ...ANSWERED, linkedAccountCount: 1, path: "owner" });
  ok(switched.done.ageBand, "the age band survives the switch");
  ok(switched.done.country, "and so does the country");
  ok(switched.done.link, "and the link they already made is still recorded as done");
  eq(switched.missing, ["guilds"], "only the one step the new path adds is outstanding");
  eq(progressOf(switched).label, "2 of 3 done", "so the bar drops by one step, not to zero");
});

test("the progress bar counts the steps of the path, not every step there is", () => {
  // The plausible bug: `ONBOARDING_STEPS.length`, which is four. Every owner
  // would then see "2 of 4" and a bar that stops at 75% on a finished account.
  for (const path of ONBOARDING_PATHS) {
    const empty = deriveUnlock({ ageBand: null, country: null, linkedAccountCount: 0, path });
    eq(progressOf(empty).total, stepsFor(path).length, `${path}'s bar is out of its own steps`);
    eq(progressOf(empty).done, 0, `${path} starts at none of them`);
    eq(progressOf(empty).percent, 0, `and at zero percent`);
  }

  const half = deriveUnlock({ ageBand: "teen", country: null, linkedAccountCount: 0 });
  eq(progressOf(half).label, "1 of 3 done", "one answer in, the label counts it");
  eq(progressOf(half).percent, 33, "and the bar is a third along");
});

test("the bar reads 100% exactly when the account is unlocked", () => {
  // Swept over every combination of the answers, on both paths, because the
  // dangerous case is not a wrong percentage — it is a bar that says finished
  // while `unlocked` is false, or the reverse. Either one is a person told the
  // wrong thing about whether they can enter.
  let checked = 0;
  for (const path of ONBOARDING_PATHS) {
    for (const ageBand of [null, "adult"]) {
      for (const country of [null, "GB"]) {
        for (const linkedAccountCount of [0, 1]) {
          for (const guildsGranted of [false, true]) {
            const state = deriveUnlock({
              ageBand,
              country,
              linkedAccountCount,
              path,
              guildsGranted,
            });
            const progress = progressOf(state);
            eq(
              progress.percent === 100,
              state.unlocked,
              `${path}: the bar and the gate agree (${progress.label})`,
            );
            checked += 1;
          }
        }
      }
    }
  }
  eq(checked, 32, "and the sweep actually ran — an empty loop asserts nothing");
});

test("the owner's step is answered by rows, not by a flag saying they granted it", async () => {
  // The page derives `guildsGranted` from `guild_admins` rows for their Discord
  // id, and this is why that is the right source: the rows are only written for
  // guilds Discord says they own or administer. A person who is merely *in* a
  // server produces none, and must not be handed a portal.
  const db = await resetDemoDb();
  await registerGuild(db, { guildId: "g-owned", name: "Theirs" });
  await registerGuild(db, { guildId: "g-member", name: "Somebody else's" });

  const discordId = "discord-owner-1";
  const seen = async () =>
    (
      await db
        .select({ id: schema.guildAdmins.id })
        .from(schema.guildAdmins)
        .where(sqlEq(schema.guildAdmins.discordId, discordId))
    ).length;

  eq(await seen(), 0, "nothing is recorded before the round trip");

  await recordGuildOwnership(db, discordId, [
    { id: "g-member", name: "Somebody else's", owner: false, permissions: "0" },
  ]);
  eq(await seen(), 0, "being a member of a server is not administering it");
  no(
    deriveUnlock({ ...ANSWERED, linkedAccountCount: 0, path: "owner", guildsGranted: false })
      .unlocked,
    "so the owner's step is still outstanding and the screen still asks",
  );

  await recordGuildOwnership(db, discordId, [
    { id: "g-owned", name: "Theirs", owner: true, permissions: "0" },
    { id: "g-member", name: "Somebody else's", owner: false, permissions: "0" },
  ]);
  eq(await seen(), 1, "the one they own is recorded, and only that one");
  ok(
    deriveUnlock({ ...ANSWERED, linkedAccountCount: 0, path: "owner", guildsGranted: true })
      .unlocked,
    "and that is what completes the owner path",
  );
});

test("the guilds scope is asked for at onboarding and nowhere near signup", async () => {
  // I10, checked against the source rather than asserted about a constant,
  // because the failure mode is a *second* call site appearing — a signup page
  // that quietly widens the scope to save a round trip later. That is invisible
  // to every other guard on the branch: it changes no derivation, no route and
  // no copy, only what Discord's consent screen says.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);

  const askers: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const src = await fs.readFile(full, "utf8");
      // Strip comments first: this very file, and the modules it guards,
      // explain the rule in prose that mentions the scope by name.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // Every file that can put a scope on Discord's consent screen — which
      // is every caller of the one function that builds the authorize URL.
      // Matching the word `guilds` instead would sweep up an onboarding step
      // name, a table name and a field on Discord's response, and a guard that
      // lists eight files for two reasons is one somebody deletes.
      // `function discordAuthUrl(` is the declaration, not a call site.
      const calls = code.replace(/function\s+discordAuthUrl\s*\(/g, "function DECL(");
      if (/\bdiscordAuthUrl\s*\(/.test(calls)) askers.push(path.relative(repoRoot, full));
    }
  };
  await walk(path.join(repoRoot, "app"));
  await walk(path.join(repoRoot, "lib"));

  ok(askers.length > 0, "the walk found the call sites — an empty list would prove nothing");
  eq(
    askers.sort(),
    ["app/api/auth/discord/route.ts"],
    "exactly one file decides what Discord is asked for, and it is not a signup page",
  );

  // ===== THE ONE THING REACHABILITY CANNOT SEE =====
  //
  // `/api/auth/[provider]` matches any `/api/auth/*`, so the reachability
  // guard reports the onboarding redirect as resolving whatever it is spelled
  // — including after somebody moves or renames the Discord route. It would
  // then be served by the game-provider handler, which answers "we do not run
  // challenges on discord" and drops the owner back on `/settings/connections`
  // having done nothing. Proven by moving the directory: nothing else on the
  // branch goes red.
  const target = path.join(repoRoot, "app", "api", "auth", "discord", "route.ts");
  ok(
    await fs
      .stat(target)
      .then(() => true)
      .catch(() => false),
    "the guilds round trip has a static route of its own, and is not falling " +
      "through to the game-provider handler that shares its prefix",
  );

  // And that file only widens the scope when it was sent here to. Checked
  // against the URL the function actually produces, because the consent screen
  // reads the query string and nothing else.
  process.env.DISCORD_CLIENT_ID ??= "test-client";
  const signin = discordAuthUrl({ state: "s" });
  const linking = discordAuthUrl({ state: "s", scopes: ["identify"] });
  const owner = discordAuthUrl({ state: "s", scopes: ["identify", "guilds"] });
  no(new URL(signin).searchParams.get("scope")?.includes("guilds"), "signup asks for identity only");
  no(new URL(linking).searchParams.get("scope")?.includes("guilds"), "and so does linking Discord");
  ok(
    new URL(owner).searchParams.get("scope")?.includes("guilds"),
    "only the round trip that asked for it gets it — otherwise this whole test " +
      "would pass on a function that never sends the scope at all",
  );
});
