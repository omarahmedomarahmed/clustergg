// A server's public page: what it shows, and what it must never. B100.
//
// The assertions that matter are the refusals. An owner is entitled to show off
// their community; nobody is entitled to a roster of the gamers inside it, and
// the difference between those two is one careless `select` on a page anybody
// can open without an account.
//
//   DEMO_DB=1 npx tsx tests/db/server-public.mts

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

const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { publicServerProfile, PUBLIC_FLOOR } = await import("../../lib/server-public.ts");

const db = await getDb();
const tag = uid().slice(0, 8);

const mkMember = async (guildId: string, opts: { linked?: boolean; verified?: boolean } = {}) => {
  const userId = uid();
  await db.insert(schema.users).values({
    id: userId, slug: `pubs-${tag}-${userId.slice(0, 6)}`,
    displayName: `Member ${userId.slice(0, 4)}`,
    email: `${userId}@ob.test`, passwordHash: "x", ageBand: "adult",
  } as never);
  await db.insert(schema.discordGuildMembers).values({
    id: uid(), guildId, userId, discordUserId: `d-${userId.slice(0, 8)}`,
  } as never);
  if (opts.linked !== false) {
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(), userId, provider: "chesscom",
      providerAccountId: `pa-${uid().slice(0, 8)}`, inGameName: "x",
      verified: opts.verified !== false,
    } as never);
  }
  return userId;
};

console.log("== a server with nobody in it does not throw ==");
{
  const p = await publicServerProfile(db, `empty-${tag}`);
  eq("it reports nothing rather than failing", p.linked, 0);
  eq("…and does not claim a payout", p.earnedAllTime, 0);
  ok("…and does not print the count", !p.showLinked);
}

console.log("\n== the counts are the ones an owner is judged on ==");
const guildId = `pubs-${tag}`;
{
  await db.insert(schema.discordGuilds).values({
    id: uid(), guildId, name: `Public ${tag}`,
  } as never);

  const members: string[] = [];
  for (let i = 0; i < PUBLIC_FLOOR + 2; i++) members.push(await mkMember(guildId));
  // Two who linked nothing, and one who typed a name without proving it. An
  // unverified row is somebody who typed a name, and counting it would inflate
  // the single number this whole page is judged on.
  await mkMember(guildId, { linked: false });
  await mkMember(guildId, { verified: false });

  const p = await publicServerProfile(db, guildId);
  eq("only verified linked accounts count", p.linked, PUBLIC_FLOOR + 2);
  ok("…and the number is printable above the floor", p.showLinked);
}

console.log("\n== a count small enough to point at somebody is not printed ==");
{
  const small = `pubs-small-${tag}`;
  await db.insert(schema.discordGuilds).values({
    id: uid(), guildId: small, name: `Small ${tag}`,
  } as never);
  await mkMember(small);
  await mkMember(small);

  const p = await publicServerProfile(db, small);
  eq("the count is still counted", p.linked, 2);
  ok("…but it is not shown", !p.showLinked, String(p.linked));
  // Proven by moving the input rather than by reading the constant: two is
  // under the floor whatever the floor is set to, and the page renders "a few".
  ok("the page has a word for it", /a few/.test(code("app/servers/[slug]/page.tsx")));
}

console.log("\n== trophies are counted by trophy, never by person ==");
{
  const winner = await mkMember(guildId);
  const other = await mkMember(guildId);
  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId, name: `Public Cup ${tag}`, imageUrl: "/t.png", value: "50",
  } as never);
  for (const u of [winner, other]) {
    await db.insert(schema.userTrophies).values({
      id: uid(), userId: u, trophyId, placement: 1, status: "held",
    } as never);
  }

  const p = await publicServerProfile(db, guildId);
  const cup = p.trophies.find((t) => t.name === `Public Cup ${tag}`);
  eq("the trophy is listed once with a count", cup?.count, 2);

  // THE ASSERTION THIS FILE EXISTS FOR. Nothing on the way out may identify a
  // member — not an id, not a slug, not a display name.
  const dump = JSON.stringify(p);
  ok("no member id escapes", !dump.includes(winner) && !dump.includes(other), dump.slice(0, 200));
  ok("no member name escapes", !/Member /.test(dump));
  ok("…and no slug either", !/pubs-/.test(dump.replace(guildId, "")));
}

console.log("\n== the money shown is the SERVER's, never a member's ==");
{
  const src = code("lib/server-public.ts");
  ok("it sums server payout lines", /serverPayoutLines/.test(src));
  ok("…and only ones actually paid", /"paid"/.test(src));
  // A gamer's redemption is their own business. A page that added it up per
  // server would be publishing what individuals earned, grouped by the Discord
  // they happen to be in.
  ok("it never reads a gamer's redemptions", !/trophyRedeems/.test(src));
  ok("…and never reads a gamer's CP", !/questEvents|cpWallet/.test(src));
}

console.log("\n== the page shows the community, not the lock ==");
{
  const page = code("app/servers/[slug]/page.tsx");
  ok("it renders the owner's own description", /profile\.profile\.about/.test(page));
  ok("…the games they named", /profile\.profile\.games/.test(page));
  ok("…what members have won", /pub\.trophies/.test(page));
  ok("…what the server has been paid", /pub\.earnedAllTime/.test(page));
  // This week's standing comes from the same function that writes the cheque,
  // never from a second calculation on the page.
  ok("…and this week's share, from the pool's own arithmetic", /livePool/.test(page));
  ok("there is a door for the reader who runs a server too",
    /Run a server like this one/.test(page));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
