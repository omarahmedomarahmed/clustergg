// B35 — the caps do not stop a second account.
//
// Money-touching, so it is written with the item (§1.1). The thing under test is
// not "can we detect fraud" — it is "can money leave before a human has looked",
// and the answer has to be no.
//
//   DEMO_DB=1 npx tsx tests/db/abuse.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { payoutHold, PAYOUT_HOLD_DAYS, QUALIFY_AFTER_DAYS, QUALIFY_RULE,
  linkedCountsFor, markTierUnlocked, payoutHoldFor, hasBeenPaid, anomalousGrowth } =
  await import("../../lib/abuse.ts");
const { tierOf } = await import("../../lib/week-close.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and: sqlAnd } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const DAY = 86400_000;

console.log("== the holding period ==");
const unlocked = new Date(Date.now() - 10 * DAY);
const inside = payoutHold(unlocked, false);
ok("a first payout inside the window is held", inside.held);
ok("…and says how long is left", /20 days left/.test(inside.reason), inside.reason);
ok("…and gives the date", !!inside.until);
const after = payoutHold(new Date(Date.now() - (PAYOUT_HOLD_DAYS + 1) * DAY), false);
ok("a first payout past the window is released", !after.held);
// A server with a track record is not held again. Holding every payout forever
// would tax the honest majority to slow down a minority we can already see.
ok("a server that has been paid before is never held", !payoutHold(new Date(), true).held);
// The dangerous case: no recorded unlock. Fail CLOSED.
const unknown = payoutHold(null, false);
ok("an unknown unlock date is HELD, not released", unknown.held);
ok("…and says a human has to confirm", /human/.test(unknown.reason));
// Exactly at the boundary.
ok("the hold ends exactly at the boundary, not a day late",
  !payoutHold(new Date(Date.now() - PAYOUT_HOLD_DAYS * DAY), false).held);

console.log("\n== qualified vs raw ==");
const guildId = `t-guild-${uid().slice(0, 8)}`;
await db.insert(schema.discordGuilds).values({ guildId, name: "Test Guild", status: "active" } as never);

const mkMember = async (linkedDaysAgo: number | null, proven: boolean) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `ab-${id.slice(0, 8)}`, displayName: "Ab", email: `${id}@test.invalid`, passwordHash: "x", ageBand: "adult",
  } as never);
  await db.insert(schema.discordGuildMembers).values({
    guildId, userId: id,
    firstLinkedAt: linkedDaysAgo === null ? null : new Date(Date.now() - linkedDaysAgo * DAY),
  } as never);
  await db.insert(schema.linkedGameAccounts).values({
    id: uid(), userId: id, provider: "chesscom", providerAccountId: `p-${id.slice(0, 8)}`,
    inGameName: "x", verified: proven,
  } as never);
  return id;
};

await mkMember(30, true);    // counts
await mkMember(30, true);    // counts
await mkMember(2, true);     // too recent
await mkMember(30, false);   // ownership never proven
await mkMember(null, true);  // never linked

const counts = await linkedCountsFor(db, guildId);
eq("the raw count includes everyone who ever linked", counts.raw, 4);
eq("…and the qualified count only the ones that survive both rules", counts.qualified, 2);
ok("an unqualified account raises the raw count and not the qualified one",
  counts.raw > counts.qualified);
ok(`the rule mentions the ${QUALIFY_AFTER_DAYS}-day wait`, QUALIFY_RULE.includes(String(QUALIFY_AFTER_DAYS)));
ok("…and says the unqualified still show in the member count",
  /still show/.test(QUALIFY_RULE), QUALIFY_RULE);

console.log("\n== the tier reads the qualified count ==");
// INVERTED BY C3, not deleted. This used to assert that the per-challenge RATE
// came from the qualified number rather than the raw one — the point being that
// the defence had to reach the money, not just the display.
//
// There is no rate any more: owners are paid from the weekly pool. The property
// still matters and still has to be checked, so it moved to the thing that now
// decides money — `tierOf`, which sorts servers into who they compete against —
// and the ASSERTION IS THE SAME ONE: a raw count buys nothing.
eq("0 qualified is the bottom tier however many linked rows exist", tierOf(0), "small");
eq("500 qualified moves up", tierOf(500), "mid");
ok("…and the rate that used to sit here is gone entirely",
  !("ownerPctFor" in (await import("../../lib/server-earnings.ts"))));

console.log("\n== B80: an address is finally counted ==");
{
  const { signupVelocity, SIGNUP_IP_LIMIT, SIGNUP_LIMIT } = await import("../../lib/abuse.ts");
  const { readFileSync } = await import("node:fs");

  // THE DEFECT: `signup()` called this with `{ email }` and no address, so the
  // IP branch could never trip and gmail aliases cost an attacker nothing.
  const auth = readFileSync(new URL("../../app/actions/auth.ts", import.meta.url), "utf8");
  ok("signup passes the address", /signupVelocity\(db, \{ email, ip \}\)/.test(auth));
  ok("…and records it on the account", /signupIp: ip/.test(auth));
  // Only the FIRST x-forwarded-for entry. The rest is client-supplied and would
  // hand an attacker a fresh address per request.
  ok("…taking only the first forwarded entry", /split\(","\)\[0\]/.test(auth));

  const tag = uid().slice(0, 8);
  const ip = `203.0.113.${Math.floor(Math.random() * 200)}-${tag}`;
  const clean = await signupVelocity(db, { email: `a@gmail.com`, ip });
  ok("an unused address is allowed", clean.ok);

  // The IP limit is far above the domain limit on purpose: an address is a
  // university NAT or a carrier, not a source.
  ok("the address limit is much higher than the domain limit", SIGNUP_IP_LIMIT > SIGNUP_LIMIT * 3,
    `${SIGNUP_IP_LIMIT} vs ${SIGNUP_LIMIT}`);

  for (let i = 0; i < SIGNUP_IP_LIMIT; i++) {
    await db.insert(schema.users).values({
      id: uid(), email: `sybil-${tag}-${i}@gmail.com`, displayName: `S${i}`,
      slug: `sybil-${tag}-${i}`, passwordHash: "x", signupIp: ip,
    });
  }
  const tripped = await signupVelocity(db, { email: "b@gmail.com", ip });
  ok("…and a script's worth from one address is refused", !tripped.ok, JSON.stringify(tripped));
  ok("…with a message that accuses nobody",
    /nothing is wrong with your account/.test(tripped.message), tripped.message);
  ok("…and says which network, not which person", /network/i.test(tripped.message));

  // A mainstream domain on a fresh address is still fine — the refusal must be
  // about the address, not about gmail.
  const other = await signupVelocity(db, { email: "c@gmail.com", ip: `${ip}-other` });
  ok("another address is unaffected", other.ok);
}

console.log("\n== the unlock stamp is one-way ==");
const first = new Date(Date.now() - 40 * DAY);
await markTierUnlocked(db, guildId, first);
const [g1] = await db.select({ t: schema.discordGuilds.tierUnlockedAt })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guildId)).limit(1);
eq("the first crossing is stamped", g1.t?.toISOString(), first.toISOString());
// A server that dips below and climbs back must not get a fresh holding period,
// and must not be able to be given one deliberately.
await markTierUnlocked(db, guildId, new Date());
const [g2] = await db.select({ t: schema.discordGuilds.tierUnlockedAt })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guildId)).limit(1);
eq("a second crossing does not restart the clock", g2.t?.toISOString(), first.toISOString());

console.log("\n== the guard, against the database ==");
ok("a guild with no completed payout has no track record", !(await hasBeenPaid(db, guildId)));
const held40 = await payoutHoldFor(db, guildId);
ok("stamped 40 days ago and never paid → released", !held40.held, held40.reason);

// Re-stamp recent by clearing first, to prove the guard reads the column.
await db.update(schema.discordGuilds).set({ tierUnlockedAt: new Date(Date.now() - 3 * DAY) })
  .where(sqlEq(schema.discordGuilds.guildId, guildId));
const held3 = await payoutHoldFor(db, guildId);
ok("stamped 3 days ago → held", held3.held);
ok("…with the days remaining stated", /27 days left/.test(held3.reason), held3.reason);

// A DRAFT payout is not a track record — otherwise anybody could open and
// cancel one to clear their own hold.
await db.insert(schema.serverPayouts).values({
  id: uid(), guildId, status: "draft", total: 100,
} as never);
ok("a draft payout does not count as having been paid", !(await hasBeenPaid(db, guildId)));
await db.insert(schema.serverPayouts).values({
  id: uid(), guildId, status: "cancelled", total: 100,
} as never);
ok("nor does a cancelled one", !(await hasBeenPaid(db, guildId)));
await db.insert(schema.serverPayouts).values({
  id: uid(), guildId, status: "paid", total: 100,
} as never);
ok("a PAID one does", await hasBeenPaid(db, guildId));
ok("…and clears the hold, even three days in", !(await payoutHoldFor(db, guildId)).held);

console.log("\n== the review queue is a queue, not a block ==");
const flags = await anomalousGrowth(db);
ok("it returns without throwing", Array.isArray(flags));
ok("a five-member server is below the threshold for a human's attention",
  !flags.some((f) => f.guildId === guildId));

console.log("\n== defence 3: velocity is a friction, not a wall ==");
// Deliberately last, and narrower than it sounds. B34 took the incentive from
// $63/day to $2.50/day for fifty accounts, and defence 2 means those fifty move
// no tier until each is a week old AND has proven a game account. So this does
// not stop the fraud any more — it stops the NOISE, and it must stay cheap
// enough that a real gamer on a shared university NAT never meets it.
{
  const { signupVelocity, SIGNUP_LIMIT, DISPOSABLE_DOMAINS, YOUNG_DISCORD_DAYS } =
    await import("../../lib/abuse.ts");
  const vtag = uid().slice(0, 6);

  const mkSignup = async (email: string, ageDays = 0) => {
    const id = uid();
    await db.insert(schema.users).values({
      id, slug: `v-${id.slice(0, 8)}`, displayName: "V", email,
      passwordHash: "x", ageBand: "adult", createdAt: new Date(Date.now() - ageDays * 86400_000),
    } as never);
  };

  // A mainstream domain is NOT a source.
  for (let i = 0; i < SIGNUP_LIMIT + 5; i++) await mkSignup(`real${i}-${vtag}@gmail.com`);
  const mainstream = await signupVelocity(db, { email: `another-${vtag}@gmail.com` });
  ok("fifteen gmail signups today do not refuse the sixteenth", mainstream.ok,
    JSON.stringify(mainstream));
  eq("…and nothing is counted against them", mainstream.seen, 0);

  // A disposable one is.
  const throwaway = DISPOSABLE_DOMAINS[0];
  const firstOne = await signupVelocity(db, { email: `a-${vtag}@${throwaway}` });
  ok("the FIRST throwaway signup is allowed", firstOne.ok, JSON.stringify(firstOne));
  for (let i = 0; i < SIGNUP_LIMIT; i++) await mkSignup(`t${i}-${vtag}@${throwaway}`);
  const eleventh = await signupVelocity(db, { email: `late-${vtag}@${throwaway}` });
  eq("…and the eleventh is refused", eleventh.ok, false);
  ok("…saying how many it saw", eleventh.seen >= SIGNUP_LIMIT, String(eleventh.seen));
  // The message matters as much as the rule: the person reading it is usually
  // not the one the limit is for.
  ok("…without accusing them of anything",
    !/bot|fraud|abuse|suspicious/i.test(eleventh.message), eleventh.message);
  ok("…and telling them their account is fine",
    /nothing is wrong with your account/i.test(eleventh.message), eleventh.message);

  // Yesterday's signups are outside the window.
  const oldTag = uid().slice(0, 6);
  for (let i = 0; i < SIGNUP_LIMIT + 2; i++) await mkSignup(`old${i}-${oldTag}@${DISPOSABLE_DOMAINS[1]}`, 3);
  const nextDay = await signupVelocity(db, { email: `today-${oldTag}@${DISPOSABLE_DOMAINS[1]}` });
  ok("a burst three days ago does not refuse today", nextDay.ok, JSON.stringify(nextDay));

  console.log("\n== a young Discord account is a SIGNAL, never a refusal ==");
  // Every real gamer's Discord account was one day old once.
  const young = await signupVelocity(db, {
    email: `young-${vtag}@gmail.com`,
    discordCreatedAt: new Date(Date.now() - 2 * 86400_000),
  });
  ok("it does not refuse", young.ok, JSON.stringify(young));
  ok("…but it is recorded for the review queue",
    young.reasons.some((r) => /days old/.test(r)), JSON.stringify(young.reasons));
  ok(`…and the threshold is ${YOUNG_DISCORD_DAYS} days`, YOUNG_DISCORD_DAYS > 0);

  console.log("\n== it fails OPEN ==");
  // What it protects is tidiness. What failing closed costs is customers.
  const broken = { select() { throw new Error("db down"); } } as never;
  const swallowed: unknown[] = [];
  const onUnhandled = (e: unknown) => swallowed.push(e);
  process.on("unhandledRejection", onUnhandled);
  const down = await signupVelocity(broken, { email: `x-${vtag}@${throwaway}` });
  await new Promise((r) => setImmediate(r));
  process.off("unhandledRejection", onUnhandled);
  eq("a broken read allows the signup", down.ok, true);

  console.log("\n== it is wired into the real signup path ==");
  const { readFile } = await import("node:fs/promises");
  const auth = await readFile(new URL("../../app/actions/auth.ts", import.meta.url), "utf8");
  // Widened by B80: the call now carries the address as well as the email.
  // The old pattern matched `{ email }` exactly, which is precisely why nobody
  // noticed the address was never being passed.
  ok("signup consults it", /signupVelocity\(db, \{ email, ip \}\)/.test(auth));
  ok("…and refuses with its own message rather than a generic one",
    /if \(!v\.ok\) return \{ error: v\.message \}/.test(auth));
  ok("…before the account row is written",
    auth.indexOf("signupVelocity") < auth.indexOf("insert(schema.users)"));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
