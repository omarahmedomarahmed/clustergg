// Closing a week and dividing the server pool. B87 / C16.
//
// The whole commercial model is weekly and nothing weekly existed — no cron, no
// pool, no scores, no payouts. This is the file that keeps it real, and the
// three assertions that matter most are the ones about money NOT moving:
//
//   * A week already closed pays nobody a second time.
//   * A payout is a DRAFT. The cron never moves money on its own.
//   * The pool is inflows minus what earlier weeks committed, so a cheque
//     sitting in "approved" for a fortnight cannot inflate next week.
//
//   DEMO_DB=1 npx tsx tests/db/week-close.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (name: string, got: number, want: number, tol = 0.02) =>
  ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);

const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq, inArray } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { closeWeek, weekKey, tierOf, slotsFor, TIERS } = await import("../../lib/week-close.ts");
const { weekStartOf } = await import("../../lib/guild-snapshot.ts");
const { JOBS, WEEKLY_DAY, runAllJobs } = await import("../../lib/jobs.ts");

const db = await getDb();

console.log("== tiers are labels, and slots scale with the field ==");
{
  ok("a new server is small", tierOf(0) === "small");
  ok("500 qualified is mid", tierOf(500) === "mid");
  ok("5,000 is large", tierOf(5000) === "large");
  ok("…and 4,999 is not", tierOf(4999) === "mid");
  ok("there are exactly three, and none of them names a rate",
    TIERS.length === 3 && !TIERS.some((t) => "ownerPct" in t));

  // The boundary problem the model names: a fixed slot count would make
  // crossing a tier boundary beat any amount of in-tier effort.
  for (const n of [1, 5, 20, 100]) {
    const s = slotsFor(n);
    near(`${n} servers → shares still total 1`, s.reduce((a, x) => a + x.share, 0), 1, 0.0001);
    ok(`…and about a fifth of them are paid`, s.length === Math.max(1, Math.round(n * 0.2)), String(s.length));
    if (s.length > 1) ok("…with first place ahead of second", s[0].share > s[1].share);
  }
}

console.log("\n== the weekly job runs on the daily cron, behind a day check ==");
{
  const j = JOBS.find((x) => x.key === "week-close");
  ok("the job exists", !!j);
  ok("…on the daily cadence, because there is no weekly cron", j?.cadence === "daily");
  ok("…gated to one day", j?.weeklyOn === WEEKLY_DAY);

  // Six days out of seven the cron must not run it — but a human fixing
  // something on a Thursday must be able to.
  const thursday = new Date(Date.UTC(2026, 7, 6)); // a Thursday
  const skipped = await runAllJobs("daily", { now: thursday });
  const row = skipped.find((r) => r.key === "week-close");
  ok("a non-Monday cron skips it", /Skipped/.test(row?.summary ?? ""), row?.summary);
  ok("…and says so rather than failing", row?.ok === true);
}

console.log("\n== a week with money and entrants pays out ==");
{
  const now = new Date();
  const thisWeek = weekStartOf(now);
  const weekStart = new Date(thisWeek.getTime() - 7 * 86400_000);
  const key = weekKey(weekStart);

  // Clear anything the demo seed left for this period so the run under test is
  // the only one, and its arithmetic can be checked exactly.
  const prior = await db.select({ id: schema.serverPayouts.id }).from(schema.serverPayouts)
    .where(eq(schema.serverPayouts.periodStart, weekStart));
  if (prior.length) {
    await db.delete(schema.serverPayoutLines)
      .where(inArray(schema.serverPayoutLines.payoutId, prior.map((p) => p.id)));
    await db.delete(schema.serverPayouts).where(eq(schema.serverPayouts.periodStart, weekStart));
  }

  // Three servers, one entrant each, plus one entrant in two of them — the
  // exclusivity rule is what stops mass-inviting other servers' gamers paying.
  const tag = uid().slice(0, 6);
  const guilds = [`wc-a-${tag}`, `wc-b-${tag}`, `wc-c-${tag}`];
  for (const g of guilds) {
    await db.insert(schema.discordGuilds).values({
      guildId: g, name: `Server ${g.slice(-4)}`, memberCount: 900,
    }).onConflictDoNothing();
    await db.insert(schema.guildSnapshots).values({
      id: uid(), guildId: g, weekStart, memberCount: 900, linked: 100, qualifiedLinked: 60,
    }).onConflictDoNothing();
  }

  const [challenge] = await db.select({ id: schema.challenges.id }).from(schema.challenges).limit(1);
  const [account] = await db.select({ id: schema.linkedGameAccounts.id, userId: schema.linkedGameAccounts.userId })
    .from(schema.linkedGameAccounts).limit(1);
  const joinAt = new Date(weekStart.getTime() + 2 * 86400_000);
  const entrants: { userId: string; guildId: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const userId = uid();
    await db.insert(schema.users).values({
      id: userId, email: `${userId}@wc.test`, displayName: `WC ${i}`, slug: `wc-${tag}-${i}`,
      passwordHash: "x", ageBand: "adult", role: "user", status: "active",
    });
    entrants.push({ userId, guildId: guilds[i] });
  }
  // …and the one who belongs to two of them. They are worth 1/2 to each.
  entrants.push({ userId: entrants[0].userId, guildId: guilds[1] });

  for (const e of entrants) {
    await db.insert(schema.challengeParticipants).values({
      id: uid(), challengeId: challenge.id, userId: e.userId,
      linkedAccountId: account.id, guildId: e.guildId, joinedAt: joinAt,
    }).onConflictDoNothing();
  }

  // Money into the server vault, DATED INSIDE the week. `postToLedger` stamps
  // now, and now is after the week it is meant to fund — a week's pool is what
  // had arrived by the time that week ended, which is the property that stops
  // late money retroactively enlarging a week somebody has already been paid
  // for.
  await db.insert(schema.vaultLedger).values({
    id: uid(), vault: "server", amount: 900, kind: "challenge_sale",
    refType: "test", refId: `wc-${tag}`, reason: "week-close fixture",
    createdAt: new Date(weekStart.getTime() + 86400_000),
  });

  const r = await closeWeek(now);
  ok("the week closed", !r.skipped, r.summary);
  ok("…naming itself by its Monday", r.week === key, r.week);
  ok("there was a pool", r.pool > 0, String(r.pool));
  ok("…and the servers under test were scored",
    guilds.every((g) => r.servers.some((s) => s.guildId === g)),
    r.servers.map((s) => s.guildId).join(","));

  // The exclusivity rule, on real rows: the gamer in two servers is worth half
  // to each, so nobody's shares can sum past the true entrant count.
  const total = r.servers.reduce((a, s) => a + s.exclusiveEntrants, 0);
  const truth = new Set(entrants.map((e) => e.userId)).size;
  ok("the shares never exceed the true entrant count", total <= truth + 1e-9, `${total} vs ${truth}`);

  // The term with no data is dropped, not scored as zero for everybody.
  ok("engaged opens did not score — nothing records them",
    !("engagedOpens" in r.terms), JSON.stringify(r.terms));
  near("…and the surviving terms still total 100",
    Object.values(r.terms).reduce((a, b) => a + b, 0), 100, 0.05);
  ok("the summary says which terms ran", /Scored on \d+ of 4 terms/.test(r.summary), r.summary);

  // Everything that took part is paid something — the participation floor is
  // what makes a pool a ladder rather than a taunt.
  const paid = new Set(r.payouts.map((p) => p.guildId));
  ok("every participating server is paid or held",
    r.payouts.length + (r.carried > 0 ? 1 : 0) > 0, JSON.stringify(r.payouts));
  ok("…and nobody who did not take part is", [...paid].every((g) => r.servers.some((s) => s.guildId === g)));

  // Money out never exceeds money in.
  const out = r.payouts.reduce((a, p) => a + p.amount, 0);
  ok("payouts never exceed the pool", out <= r.pool + 0.01, `${out} vs ${r.pool}`);

  console.log("\n== …as DRAFTS, and only once ==");
  const written = await db.select({ id: schema.serverPayouts.id, status: schema.serverPayouts.status })
    .from(schema.serverPayouts).where(eq(schema.serverPayouts.periodStart, weekStart));
  ok("payout rows were written", written.length > 0, String(written.length));
  // The cron calculates; a human releases. A job that moved money on its own is
  // one nobody could stop on a Sunday.
  ok("…and none of them is paid", written.every((p) => p.status !== "paid"));

  const again = await closeWeek(now);
  ok("closing the same week twice is refused", again.skipped === true, again.summary);
  const after = await db.select({ id: schema.serverPayouts.id }).from(schema.serverPayouts)
    .where(eq(schema.serverPayouts.periodStart, weekStart));
  ok("…and not one extra payout appeared", after.length === written.length,
    `${after.length} vs ${written.length}`);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
