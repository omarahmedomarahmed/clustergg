// B22 — paying the gamer who brought us a server.
//
// The install is only observable in an OAuth callback, and an OAuth callback has
// no session, so `bot_added` sat in the catalogue with a weight and a cap and no
// possible emitter (B15 shipped the other three and said so). The missing piece
// is `state`: a standard OAuth field Discord hands back untouched.
//
// It is signed, and most of this file is about why. `state` comes home through
// the user's browser, so an unsigned one is a URL anybody can write — with
// somebody else's id in it, or with their own id and a guild they never touched.
//
//   DEMO_DB=1 npx tsx tests/db/bot-attribution.mts

process.env.DEMO_DB = "1";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "bot-attribution-test-secret";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { signInstallState, verifyInstallState, creditInstall, INSTALL_ACTION, STATE_TTL_MS } =
  await import("../../lib/discord/install-credit.ts");
const { installUrl, installHref } = await import("../../lib/discord/config.ts");
const { ACTION_CATALOG } = await import("../../lib/quests.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();

const mkUser = async (tag: string, status = "active") => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `ba-${tag}-${id.slice(0, 6)}`, displayName: `BA ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x", status,
  } as never);
  return id;
};
const awards = async (userId: string) =>
  db.select().from(schema.questEvents)
    .where(and(sqlEq(schema.questEvents.userId, userId), sqlEq(schema.questEvents.actionKey, INSTALL_ACTION)));

console.log("== the state round-trips, and only ours does ==");
const gamer = await mkUser("gamer");
const state = signInstallState(gamer);
eq("a minted state recovers its gamer", verifyInstallState(state), gamer);
eq("no state is nobody", verifyInstallState(null), null);
eq("garbage is nobody", verifyInstallState("nonsense"), null);
eq("a state with the right shape and no signature is nobody",
  verifyInstallState(`${gamer}.${Date.now()}.deadbeefdeadbeefdeadbeefdeadbeef`), null);

// The attack the signature exists for: swapping the id and keeping the mac.
const [, issued, sig] = state.split(".");
const thief = await mkUser("thief");
eq("somebody else's id with our signature is refused",
  verifyInstallState(`${thief}.${issued}.${sig}`), null);
// …and the timestamp is inside the signed payload, so it cannot be refreshed.
eq("a state re-dated to now is refused",
  verifyInstallState(`${gamer}.${Date.now()}.${sig}`), null);

console.log("\n== a state expires ==");
const old = signInstallState(gamer, Date.now() - STATE_TTL_MS - 1000);
eq("past the window it is nobody", verifyInstallState(old), null);
const fresh = signInstallState(gamer, Date.now() - 60_000);
eq("inside the window it still works", verifyInstallState(fresh), gamer);
// A state stamped in the future is what a forged timestamp looks like.
eq("a state from the future is refused",
  verifyInstallState(signInstallState(gamer, Date.now() + 10 * 60_000)), null);

console.log("\n== a completed install by a signed-in gamer pays, once ==");
const guild = `guild-${uid().slice(0, 10)}`;
const first = await creditInstall(guild, signInstallState(gamer));
eq("it credits", first, { credited: true, userId: gamer });
const paid = await awards(gamer);
eq("one award", paid.length, 1);
eq("…keyed on the guild", paid[0].refId, guild);
ok("…and it actually paid CP", Number(paid[0].cpAwarded) > 0, String(paid[0].cpAwarded));
const [row] = await db.select({ by: schema.discordGuilds.installedByUserId })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guild)).limit(1);
eq("the server records who brought it", row?.by, gamer);

console.log("\n== the same guild never pays twice ==");
const again = await creditInstall(guild, signInstallState(gamer));
eq("a second install of the same server credits nobody", again, { credited: false, reason: "already_credited" });
eq("…and mints no second award", (await awards(gamer)).length, 1);

// The one the per-user dedup inside `awardQuestAction` would NOT have caught:
// a DIFFERENT gamer claiming a server that is already credited.
const claimer = await mkUser("claimer");
const stolen = await creditInstall(guild, signInstallState(claimer));
eq("a second gamer cannot claim a credited server", stolen, { credited: false, reason: "already_credited" });
eq("…and earns nothing", (await awards(claimer)).length, 0);
const [after] = await db.select({ by: schema.discordGuilds.installedByUserId })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guild)).limit(1);
eq("…and the original credit stands", after?.by, gamer);

console.log("\n== an install by somebody with no account is not an error ==");
// The COMMON case: Discord's own App Directory button carries no state at all.
const noState = await creditInstall(`guild-${uid().slice(0, 8)}`, null);
eq("no state, no credit, no throw", noState, { credited: false, reason: "no_state" });
const badState = await creditInstall(`guild-${uid().slice(0, 8)}`, "not-a-real-state");
eq("a bad state, likewise", badState, { credited: false, reason: "bad_state" });
const ghost = await creditInstall(`guild-${uid().slice(0, 8)}`, signInstallState("no-such-user-id"));
eq("a state for a gamer who does not exist", ghost, { credited: false, reason: "no_such_user" });
const banned = await creditInstall(`guild-${uid().slice(0, 8)}`, signInstallState(await mkUser("banned", "banned")));
eq("…or for one who is not active", banned, { credited: false, reason: "no_such_user" });

console.log("\n== the credit survives the guild row arriving late ==");
// `creditInstall` races `onboardGuild`, which is what normally creates the row.
const early = `guild-${uid().slice(0, 10)}`;
const racer = await mkUser("racer");
const raced = await creditInstall(early, signInstallState(racer));
eq("it credits even with no guild row yet", raced.credited, true);
const [stub] = await db.select({ by: schema.discordGuilds.installedByUserId })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, early)).limit(1);
eq("…writing a row rather than losing the credit", stub?.by, racer);

console.log("\n== the daily cap and the configured weight apply ==");
const capper = ACTION_CATALOG.find((a) => a.key === INSTALL_ACTION)!;
ok("the action has a weight somebody chose", capper.defaultWeight > 0, String(capper.defaultWeight));
ok("…and a cap", capper.defaultCap > 0, String(capper.defaultCap));
const busy = await mkUser("busy");
for (let i = 0; i < capper.defaultCap + 3; i++) {
  await creditInstall(`guild-cap-${i}-${uid().slice(0, 6)}`, signInstallState(busy));
}
const capped = await awards(busy);
ok(`no more than ${capper.defaultCap} installs pay in a day`, capped.length <= capper.defaultCap,
  `${capped.length} awards, cap ${capper.defaultCap}`);
// The installs themselves are NOT blocked — the cap is on the points.
const guilds = await db.select({ by: schema.discordGuilds.installedByUserId })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.installedByUserId, busy));
ok("…but every server is still recorded as theirs", guilds.length > capped.length,
  `${guilds.length} guilds vs ${capped.length} awards`);

console.log("\n== the token is never baked into a cached page ==");
// The defect this shape exists to avoid: a Discord URL rendered into a cached
// public page freezes ONE gamer's token into the HTML and credits them for
// every install after it. Buttons point at a route, which cannot be frozen.
eq("installHref is a route, not a Discord URL", installHref(), process.env.DISCORD_APP_ID ? "/api/discord/install" : null);
const bare = installUrl();
ok("installUrl with no state carries no state", !bare || !/[?&]state=/.test(bare), String(bare));
const withState = installUrl("abc.123.def");
ok("…and carries one when given one", !withState || /[?&]state=abc\.123\.def/.test(withState), String(withState));

const pages = ["app/page.tsx", "app/discord-bot/page.tsx", "app/servers/page.tsx",
  "app/pricing/page.tsx", "app/vote/page.tsx", "components/AddBotButton.tsx"];
for (const f of pages) {
  const src = await readFile(new URL(`../../${f}`, import.meta.url), "utf8");
  ok(`${f} links the route, not the OAuth URL`, !/\binstallUrl\(\)/.test(src));
}
// The admin page is the ONE exception: it displays the literal OAuth URL for
// the Discord developer portal, which is what that field wants.
const adminSrc = await readFile(new URL("../../app/admin/discord/page.tsx", import.meta.url), "utf8");
ok("the admin config page still shows the literal URL", /installUrl\(\)/.test(adminSrc));

console.log("\n== the callback reads state in the request, not in `after` ==");
// `after()` runs once the response is sent; the URL is not available to it. A
// state read inside the callback would be null every time, and the whole item
// would silently credit nobody while looking wired up.
const cb = await readFile(new URL("../../app/api/discord/installed/route.ts", import.meta.url), "utf8");
const iRead = cb.indexOf('q.get("state")');
const iAfter = cb.indexOf("after(async");
ok("state is read from the query", iRead > 0);
ok("…before `after` is scheduled", iRead < iAfter, `${iRead} vs ${iAfter}`);
ok("the credit runs after onboarding, so the guild row exists",
  cb.indexOf("onboardGuild") < cb.indexOf("creditInstall"));
ok("a failed credit cannot fail an install", /catch \{ \/\* non-fatal, by construction/.test(cb));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
