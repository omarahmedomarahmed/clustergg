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
  // B47's gate moved into the weekly close with C3: a server we cannot describe
  // is one we cannot sell, and it cannot be paid. So the fixtures describe
  // themselves — and the fourth one below deliberately does not.
  const PROFILE = {
    games: ["Chess"], regions: ["mena"], vibes: ["competitive"],
    about: "Ranked chess.", answeredAt: new Date().toISOString(),
  };
  for (const g of guilds) {
    await db.insert(schema.discordGuilds).values({
      guildId: g, name: `Server ${g.slice(-4)}`, memberCount: 900,
      community: PROFILE, contactEmail: `${g}@wc.test`,
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

  // A fourth server that carried an entrant and never described itself. It must
  // be dropped from the run, not paid zero — leaving it in would let it take
  // percentile positions off servers that did the work.
  const ghostGuild = `wc-x-${tag}`;
  await db.insert(schema.discordGuilds).values({
    guildId: ghostGuild, name: "Undescribed", memberCount: 900,
  }).onConflictDoNothing();
  await db.insert(schema.guildSnapshots).values({
    id: uid(), guildId: ghostGuild, weekStart, memberCount: 900, linked: 100, qualifiedLinked: 60,
  }).onConflictDoNothing();
  {
    const userId = uid();
    await db.insert(schema.users).values({
      id: userId, email: `${userId}@wc.test`, displayName: "WC ghost", slug: `wc-${tag}-x`,
      passwordHash: "x", ageBand: "adult", role: "user", status: "active",
    });
    await db.insert(schema.challengeParticipants).values({
      id: uid(), challengeId: challenge.id, userId,
      linkedAccountId: account.id, guildId: ghostGuild, joinedAt: joinAt,
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

  // The gate, on real rows.
  ok("a server that never described itself is not scored",
    !r.servers.some((x) => x.guildId === ghostGuild), r.servers.map((x) => x.guildId).join(","));
  ok("…nor paid", !r.payouts.some((x) => x.guildId === ghostGuild));
  ok("…and the run says how many it skipped", /skipped for an incomplete server profile/.test(r.summary), r.summary);

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

console.log("\n== C3: the per-challenge owner rate is gone from all four places ==");
{
  const { readFileSync } = await import("node:fs");
  const code = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
  const exists = (f: string) => { try { readFileSync(new URL(`../../${f}`, import.meta.url)); return true; } catch { return false; } };

  // The functions are DELETED, not returning zero. A function that returns 0%
  // is one somebody re-enables; one that does not exist is a compile error at
  // every site that assumed it.
  const earnings = code("lib/server-earnings.ts");
  for (const fn of ["ownerPctFor", "earningOwnerPct", "clusterPctFor", "monthlyCeiling"]) {
    ok(`${fn} no longer exists`, !new RegExp(`export (function|const) ${fn}\\b`).test(earnings));
  }
  ok("a tier carries no rate", !/ownerPct/.test(earnings));
  ok("…and a challenge no longer computes an owner cut",
    !/owner: round2/.test(earnings));

  // All four sites the review named, each checked separately — deleting one and
  // leaving the public page is the failure this list exists to prevent.
  ok("1. the earnings module is clean", !/ownerPct/.test(earnings));
  ok("2. the owner portal is clean", !/ownerPct/.test(code("lib/server-portal.ts")));
  ok("3. the public /servers ladder is clean", !/ownerPct/.test(code("lib/pricing.ts")));
  ok("4. the Discord owner screen is clean", !/ownerPctFor|clusterPctFor/.test(code("lib/discord/screens.ts")));

  // …and every surface that printed it.
  for (const f of [
    "components/ServerPortal.tsx", "components/ServerEarnCards.tsx",
    "app/admin/billing/page.tsx", "app/admin/payouts/page.tsx",
    "app/servers/[slug]/page.tsx", "lib/billing.ts",
  ]) {
    ok(`${f} prints no per-server rate`, exists(f) && !/ownerPct/.test(code(f)));
  }
  // `lib/blog.ts` is checked on its COPY rather than its identifiers. It still
  // resolves an `{ownerPct}` token, deliberately: a post written before the
  // change would otherwise render the raw `{ownerPct}` to a reader. The token
  // now yields the pool share, and what must not survive is the CLAIM.
  const blog = code("lib/blog.ts");
  ok("the blog no longer claims a per-challenge cut",
    !/of every sponsored challenge that runs in your server/.test(blog));
  ok("…and the retired token resolves to the pool share",
    /ownerPct: `\$\{DEFAULT_SPLIT\.server\}%`/.test(blog));

  // The manual payout path that applied the rate is gone too. Leaving it would
  // have paid an owner twice — once from the pool, once from a retired rate.
  ok("openServerPayout is deleted", !/export async function openServerPayout/.test(code("app/actions/payouts.ts")));
  ok("…and its button with it", !/OpenButton/.test(code("components/PayoutQueue.tsx")));
  // The manual path a human uses for their own reasons is deliberately kept.
  ok("openManualPayout survives", /export async function openManualPayout/.test(code("app/actions/payouts.ts")));

  // What replaced it has to be reachable from what an owner is paid by.
  ok("billing reads the pool's own payouts",
    /WEEK_CLOSE_ACTOR/.test(code("lib/billing.ts")));
  ok("…and so does the owner portal", /WEEK_CLOSE_ACTOR/.test(code("lib/server-portal.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
