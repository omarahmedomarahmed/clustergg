// B45 — the portal key follows ownership.
//
// Money-adjacent (§1.1): the portal key is what opens a server's earnings, its
// payout requests and its private community numbers. Discord overwrites
// `owner_id` when a server is transferred and we already read that field on
// every refresh — so we SAW the change and did nothing, and the previous owner
// kept the door open on a community that was no longer theirs.
//
// The rule from B4, which this is just made mechanical: **the key goes to
// `owner_id` and to nobody else, ever.**
//
//   DEMO_DB=1 npx tsx tests/db/portal-key.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { onOwnerChanged } = await import("../../lib/portal-key.ts");
const { ensurePortal, getServerBySlugOrId } = await import("../../lib/server-portal.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and, desc } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
const tag = uid().slice(0, 6);

const mkGuild = async (owner: string | null) => {
  const guildId = `pk-${uid().slice(0, 10)}`;
  await db.insert(schema.discordGuilds).values({
    guildId, name: `Transferred ${tag}`, status: "active", ownerDiscordId: owner,
  } as never);
  await ensurePortal(guildId);
  return guildId;
};
const keyOf = async (guildId: string) =>
  (await db.select({ k: schema.discordGuilds.portalKey }).from(schema.discordGuilds)
    .where(sqlEq(schema.discordGuilds.guildId, guildId)).limit(1))[0]?.k ?? null;

console.log("== the ordinary case is free ==");
// This runs on every guild read. If it wrote, DM'd or rotated on a no-change
// refresh it would lock the real owner out as fast as it let them in.
const stable = await mkGuild("owner-A");
const keyBefore = await keyOf(stable);
eq("the same owner is not a change", await onOwnerChanged(stable, "owner-A", "owner-A"),
  { rotated: false, reason: "same_owner" });
eq("…and the key is untouched", await keyOf(stable), keyBefore);
eq("no reported owner is not a change", await onOwnerChanged(stable, "owner-A", null),
  { rotated: false, reason: "no_new_owner" });
// Learning an owner for the FIRST time is not a transfer — rotating there would
// invalidate the key we handed somebody at install.
eq("learning an owner for the first time is not a transfer",
  await onOwnerChanged(stable, null, "owner-A"), { rotated: false, reason: "same_owner" });
eq("…and still nothing moved", await keyOf(stable), keyBefore);

console.log("\n== a real transfer rotates the key, exactly once ==");
const moved = await mkGuild("owner-OLD");
const oldKey = await keyOf(moved);
ok("it had a key", !!oldKey);
const first = await onOwnerChanged(moved, "owner-OLD", "owner-NEW");
ok("it rotates", first.rotated, JSON.stringify(first));
const newKey = await keyOf(moved);
ok("…to a different key", !!newKey && newKey !== oldKey, `${oldKey} → ${newKey}`);
eq("…and names the new owner", first.rotated ? first.newOwner : null, "owner-NEW");

// EXACTLY once: the refresh job calls this repeatedly, and a rotation per read
// is a new owner locked out on their second page load.
const second = await onOwnerChanged(moved, "owner-NEW", "owner-NEW");
eq("a second read with the same owner does nothing", second, { rotated: false, reason: "same_owner" });
eq("…and the key is stable", await keyOf(moved), newKey);

console.log("\n== the OLD key is refused immediately ==");
// No grace period, deliberately: a window in which a former owner can still pull
// a payout report is the whole problem restated with a timer on it.
const byOldKey = await db.select().from(schema.discordGuilds)
  .where(and(sqlEq(schema.discordGuilds.guildId, moved), sqlEq(schema.discordGuilds.portalKey, oldKey!)));
eq("the old key matches nothing", byOldKey.length, 0);
const byNewKey = await db.select().from(schema.discordGuilds)
  .where(and(sqlEq(schema.discordGuilds.guildId, moved), sqlEq(schema.discordGuilds.portalKey, newKey!)));
eq("…and the new one matches the server", byNewKey.length, 1);
const portal = await getServerBySlugOrId(moved);
eq("the portal now carries the new key", portal?.portalKey, newKey);

console.log("\n== admin is told, either way ==");
const notes = await db.select().from(schema.notifications)
  .where(sqlEq(schema.notifications.type, "system"))
  .orderBy(desc(schema.notifications.createdAt)).limit(20);
const about = notes.filter((n) => (n.body ?? "").includes(`Transferred ${tag}`));
ok("a notice was raised", about.length > 0, JSON.stringify(notes.slice(0, 2).map((n) => n.title)));
// Discord is not configured in this environment, so the DM cannot land — which
// is exactly the case that must be LOUD. A rotated key nobody received is a
// locked-out customer, and the only thing worse is not knowing.
eq("the DM did not land here", first.rotated ? first.delivered : null, false);
ok("…so the notice says UNDELIVERED, not 'done'",
  about.some((n) => /UNDELIVERED/.test(n.title)), JSON.stringify(about.map((n) => n.title)));
ok("…and says they are locked out until somebody sends it",
  about.some((n) => /locked out/i.test(n.body ?? "")), JSON.stringify(about.map((n) => n.body?.slice(0, 60))));

console.log("\n== the key never goes anywhere but to the new owner ==");
// The B4 rule. Asserted on the source, because the failure mode is a helpful
// addition — a channel post, a log line — rather than a bug.
const src = await readFile(new URL("../../lib/portal-key.ts", import.meta.url), "utf8");
const dmBlock = src.slice(src.indexOf("dmUser("), src.indexOf("await tellAdmins"));
ok("the DM is addressed to the NEW owner", /dmUser\(nextOwner/.test(src), dmBlock.slice(0, 80));
ok("…and never to the previous one", !/dmUser\(previousOwner/.test(src));
ok("the key is not in the admin notice",
  !/\$\{key\}/.test(src.slice(src.indexOf("await tellAdmins"))));
ok("…and not logged anywhere", !/console\.(log|info|warn)/.test(src));

console.log("\n== detection sits where we already read the guild ==");
const guilds = await readFile(new URL("../../lib/discord/guilds.ts", import.meta.url), "utf8");
const body = guilds.slice(guilds.indexOf("export async function upsertGuild"));
ok("upsertGuild reads the previous owner BEFORE overwriting it",
  body.indexOf("const [was]") < body.indexOf("onConflictDoUpdate"), "");
ok("…and checks for a change after the write", /onOwnerChanged\(guildId, was\.owner, nextOwner\)/.test(body));
ok("…awaited, not floated — this one moves access to money",
  /await onOwnerChanged/.test(body));

console.log("\n== an unknown guild is refused rather than rotating nothing ==");
eq("no such server", await onOwnerChanged(`missing-${tag}`, "a", "b"),
  { rotated: false, reason: "no_guild" });

console.log("\n== the notice reaches a real account ==");
// Found while building this: `role = "admin"` matches NOBODY. Every account in
// this codebase is `superadmin`, `staff` or `user` — so the pre-existing
// `notifyAdmins` in app/actions/trophies.ts had been raising every
// "payout preference locked" notice to zero people, silently, since it was
// written. Asserted on the DATA, so the roles moving again fails here.
const roles = [...new Set((await db.select({ r: schema.users.role }).from(schema.users)).map((u) => u.r))];
ok("no account actually has the bare role \"admin\"", !roles.includes("admin"), JSON.stringify(roles));
ok("…which is why the query has to match superadmin too", roles.includes("superadmin"), JSON.stringify(roles));
const troph = await readFile(new URL("../../app/actions/trophies.ts", import.meta.url), "utf8");
ok("the pre-existing notifier was fixed too",
  /inArray\(schema\.users\.role, \["admin", "superadmin"\]\)/.test(troph));
ok("…and this one matches both", /inArray\(schema\.users\.role, \["admin", "superadmin"\]\)/.test(src));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
