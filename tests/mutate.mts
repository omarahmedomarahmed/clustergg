// The mutation harness.
//
// A separate tool that asks one question the test band cannot ask itself:
// **can it tell working code from broken code?**
//
// Each mutation is a small, plausible, silent change — the kind somebody makes
// on a Friday believing it is a simplification — and the harness reports how
// many suites noticed. docs/09-TEST-PLAN.md sets the expected number for each,
// and says the thing that matters in as many words:
//
//   "A mutation caught by zero suites is a hole, and the report says so in
//    those words. A mutation caught by one is worth looking at too: one
//    assertion is one edit away from none."
//
// ===== THE HARNESS MUST ALWAYS RESTORE THE FILE =====
//
// On success, on failure, on crash, on interrupt. A harness that can leave the
// repository mutated is worse than no harness: the next person's green run is
// against code nobody chose. So every mutation is applied inside a try/finally
// AND a signal handler restores anything outstanding, AND the harness verifies
// the restore by comparing bytes before it moves on.

import fs from "node:fs/promises";
// ===== THE SYNCHRONOUS WRITER, IMPORTED RATHER THAN REQUIRED =====
//
// The signal handler below has to restore files **synchronously** — an async
// handler may not finish before the process exits. It used to reach for
// `require("node:fs")`, which does not exist in an ESM module: every interrupt
// threw, hit the catch, and printed *"COULD NOT RESTORE … restore it by hand"*.
//
// So the one path this harness's own header calls *"the most likely way this
// harness ever gets stopped"* had never worked. Found by a ten-minute timeout
// killing a run mid-mutation, which left `lib/identity/attribution.ts` broken
// on disk — the exact outcome the header promises is impossible.
//
// The honest message is why it cost nothing: the handler said what it had
// failed to do, in those words, instead of exiting quietly.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

type Mutation = {
  name: string;
  file: string;
  find: string;
  replace: string;
  /** How many suites docs/09-TEST-PLAN.md expects to notice. */
  expect: number;
};

/**
 * The ten mutations from the test plan, plus the ones later stages earned.
 *
 * Each `find` is a real line of the codebase. If one stops matching, the
 * harness fails loudly rather than skipping — a mutation that silently does
 * not apply is a mutation reported as "caught by zero", which is the same
 * words as a genuine hole and would be read as one.
 */
const MUTATIONS: Mutation[] = [
  {
    name: "Move 10% of the prize to Cluster",
    file: "lib/money/amounts.ts",
    find: "  prize: 5_000,\n  server: 2_500,\n  cluster: 2_500,",
    replace: "  prize: 4_000,\n  server: 2_500,\n  cluster: 3_500,",
    expect: 2,
  },
  {
    name: "Delete the flat participation share",
    file: "lib/pool/score.ts",
    find: "  const flatEach = Math.floor(flatPoolCents / kpis.length);",
    replace: "  const flatEach = 0;",
    expect: 1,
  },
  {
    name: "Make every account count as ownership-proven",
    file: "lib/identity/accounts.ts",
    find: 'const PROOF: ReadonlySet<string> = new Set(["icon", "oauth", "openid", "admin"]);',
    replace:
      'const PROOF: ReadonlySet<string> = new Set(["claimed", "exists", "icon", "oauth", "openid", "admin"]);',
    expect: 1,
  },
  {
    name: "Let a half-onboarded gamer enter",
    file: "lib/identity/unlock.ts",
    find: "    unlocked: missing.length === 0,",
    replace: "    unlocked: true,",
    expect: 1,
  },
  {
    name: "Baseline at challenge start regardless of join time",
    file: "lib/challenges/scoring.ts",
    find: "  return joinedAt.getTime() > challengeStart.getTime() ? joinedAt : challengeStart;",
    replace: "  return challengeStart;",
    expect: 2,
  },
  {
    name: "Allow trophies worth more than the prize pool",
    file: "lib/trophies/trophies.ts",
    find: "      await assertHeadroom(tx, trophy.valueCents);",
    replace: "",
    expect: 1,
  },
  {
    name: "Allow a pool allocation above half the vault",
    file: "lib/money/pool.ts",
    find:
      "    if (input.amountCents > maxCents) {\n" +
      "      throw new PoolAllocationRefused(input.amountCents, vaultCents, maxCents);\n" +
      "    }",
    replace: "",
    expect: 1,
  },
  {
    name: "Make a $0 trophy redeemable",
    file: "lib/trophies/redemption.ts",
    find: "  if (holding.trophy.valueCents === 0) {",
    replace: "  if (false) {",
    expect: 1,
  },
  {
    name: "Stop scrubbing secrets from provider errors",
    file: "lib/providers/adapters.ts",
    find: "export function scrubSecrets(s: string): string {",
    replace: "export function scrubSecrets(s: string): string {\n  return s;",
    expect: 1,
  },
  {
    name: "Re-point a proven account after a key change",
    file: "lib/core/sync.ts",
    find: "    if (isProven(account.verifiedMethod)) {",
    replace: "    if (false) {",
    expect: 1,
  },
  // ── Earned by later stages. Each of these was a real defect or a real
  //    hole found while building, so each is worth keeping honest.
  {
    name: "Put the tight Riot endpoint back on the hot path",
    file: "lib/providers/adapters.ts",
    find: "      const [summoner, masteryRaw] = a.rich",
    replace: "      const [summoner, masteryRaw] = true",
    expect: 1,
  },
  {
    name: "Ignore the per-challenge queue setting",
    file: "lib/providers/adapters.ts",
    find: '      const queue = a.queue ?? "solo";',
    replace: '      const queue = "solo";',
    expect: 1,
  },
  {
    name: "Route an unpaid invoice into the vaults",
    file: "lib/money/ledger.ts",
    find: "    if (!invoice.paidAt) {",
    replace: "    if (false) {",
    expect: 1,
  },
  {
    name: "Let a decoration take a card down",
    file: "lib/cards/render.ts",
    find: "    return { ok: true, value: await fn() };\n  } catch (e) {",
    replace: "    return { ok: true, value: await fn() };\n  } catch (e) {\n    throw e;",
    expect: 1,
  },
  // ===== ATTRIBUTION AND ELIGIBILITY =====
  //
  // These replace "stop splitting an entrant across the servers they belong
  // to", which mutated the ½-across-every-server block sprint 5 deleted. The
  // harness reported it as no longer applying rather than as a hole, which is
  // the whole reason that distinction exists in the output.
  {
    name: "Give the join server full credit instead of a half",
    file: "lib/identity/attribution.ts",
    find:
      "  return [\n" +
      "    { guildId: parent, share: 0.5 },\n" +
      "    { guildId: join, share: 0.5 },\n" +
      "  ];",
    replace: "  return [{ guildId: join, share: 1 }];",
    expect: 2,
  },
  {
    name: "Give two halves when parent and join are the same server",
    file: "lib/identity/attribution.ts",
    find: "  if (parent === join) return [{ guildId: parent, share: 1 }];",
    replace: "",
    expect: 1,
  },
  {
    name: "Let a gamer set their own parent server",
    file: "lib/identity/attribution.ts",
    find: "  if (input.actorId === input.userId) {",
    replace: "  if (false) {",
    expect: 1,
  },
  {
    name: "Read the parent live at scoring instead of the frozen stamp",
    file: "lib/pool/score.ts",
    find: "      parentGuildId: p.parentGuildIdAtBaseline,",
    replace:
      "      parentGuildId:\n" +
      "        (\n" +
      "          await db\n" +
      "            .select({ parentGuildId: schema.users.parentGuildId })\n" +
      "            .from(schema.users)\n" +
      "            .where(eq(schema.users.id, p.userId))\n" +
      "        )[0]?.parentGuildId ?? null,",
    expect: 2,
  },
  {
    name: "Freeze the conversion denominator at the gun snapshot",
    file: "lib/pool/score.ts",
    find: "    const linkedMembers = Math.max(linkedNow, parented.size);",
    // The gate's ten, frozen — which is exactly the 3.0 E1 describes. Written
    // as a literal rather than the imported constant so the mutation needs no
    // import: production code must not carry a dead one to make a mutation
    // compile.
    replace: "    const linkedMembers = 10;",
    expect: 1,
  },
  {
    name: "Re-check pool eligibility mid-week",
    file: "lib/pool/score.ts",
    find: "    if (!isFrozenEligible(guild, week.start)) {",
    // The profile half of the gate, read live off the row instead of the
    // freeze. Inlined for the same reason as above.
    replace:
      "    if (!guild.coverImageUrl || !guild.inviteUrl || !guild.memberAgeRange) {",
    expect: 2,
  },
  {
    name: "Let a KPI read a guild_snapshots row",
    file: "lib/pool/score.ts",
    find: "    const linkedNow = await linkedMembersOf(db, guild.guildId);",
    replace:
      "    const linkedNow =\n" +
      "      (\n" +
      "        await db\n" +
      "          .select()\n" +
      "          .from(schema.guildSnapshots)\n" +
      "          .where(eq(schema.guildSnapshots.guildId, guild.guildId))\n" +
      "      )[0]?.linkedCount ?? (await linkedMembersOf(db, guild.guildId));",
    expect: 2,
  },
  {
    name: "Announce without checking readiness",
    file: "lib/challenges/lifecycle.ts",
    find: "    const readiness = await readinessOf(tx, challengeId);\n    if (!readiness.ready) {",
    replace: "    const readiness = await readinessOf(tx, challengeId);\n    if (false) {",
    expect: 1,
  },
  {
    name: "Let a job release money",
    file: "lib/money/payouts.ts",
    find:
      "  if (!actorId) {\n" +
      "    throw new PayoutNotReleasable(\n" +
      '      "Releasing money requires a person. A job computes; a human releases.",\n' +
      "    );\n" +
      "  }",
    replace: "",
    expect: 1,
  },
  {
    // ===== REPOINTED AT THE RULE THAT ACTUALLY RUNS =====
    //
    // This used to mutate `mapAdminRole` in `lib/discord/admin.ts`, which was a
    // **second** implementation of S5 with no caller anywhere — and a looser
    // one: `^\d+$` against the live `^\d{5,}$`, so the two disagreed about
    // whether "1" is a role ID. It was deleted in Sprint 16, and the harness
    // refused to run rather than reporting a mutation it could not apply as
    // caught by zero. That refusal is the harness working.
    //
    // `setOwnerContact` is where the rule is enforced: the portal's Settings
    // page is the only surface that sets an admin role.
    name: "Store an admin role by name",
    file: "lib/portal/owner.ts",
    find: "  if (input.adminRoleId && !/^\\d{5,}$/.test(input.adminRoleId.trim())) {",
    replace: "  if (false) {",
    expect: 1,
  },

  // ===== THE NINE `09-TEST-PLAN` NAMES THAT HAD NO MUTATION =====
  //
  // 09's table lists 27. Eighteen were here; six more were earned by later
  // stages and are not in the document. That left nine of 09's own names with
  // nothing behind them — which is the quietest possible kind of gap, because
  // the harness reported "24 mutations, all caught" and the document said 27.
  //
  // Every one of these guards a rule sprints 5 to 10a actually built, so a
  // hole here would be a hole in the newest and least-exercised half of the
  // platform.
  {
    name: "Let an administrator withdraw",
    file: "lib/portal/permissions.ts",
    find: '  if (facts.access.kind !== "owner" && facts.access.kind !== "demo") {',
    replace: "  if (false) {",
    expect: 2,
  },
  {
    name: "Recompute a closed week instead of reading its record",
    file: "lib/pool/record.ts",
    // 05 §6 rule 3 — *"nothing on these pages is recalculated."* The share a
    // server was paid is a frozen reading, not a quantity to re-derive: it is
    // scored + flat with the rounding the close applied, and the pool divided
    // by the servers in it is the shape somebody writes when they have not
    // read 02 §5. Both are plausible; only one is what left the vault.
    //
    // This is the reader every consumer goes through — the admin week pages,
    // the per-server history and the Saturday standings card — so a recompute
    // here is a recompute everywhere, which is exactly why 09 wants two
    // suites on it rather than one.
    find:
      "    .orderBy(asc(schema.weekRecords.rank), asc(schema.weekRecords.guildName));\n" +
      "  return currentRows(rows);\n}",
    replace:
      "    .orderBy(asc(schema.weekRecords.rank), asc(schema.weekRecords.guildName));\n" +
      "  const current = currentRows(rows);\n" +
      "  return current.map((r) => ({\n" +
      "    ...r,\n" +
      "    totalCents: Math.round(r.poolCents / Math.max(1, r.serversInPool)),\n" +
      "  }));\n}",
    expect: 2,
  },
  {
    name: "Overwrite last week's record at the next gun",
    file: "lib/pool/eligibility.ts",
    find: "  if (guild.eligibilityFrozenAt.getTime() !== weekStart.getTime()) return false;",
    replace: "",
    expect: 1,
  },
  {
    name: "Join the guild's current name instead of the stored one",
    file: "lib/pool/record.ts",
    find: "      guildName: share.name,",
    replace: '      guildName: "",',
    expect: 1,
  },
  {
    name: "Drop ineligible servers from the record instead of recording why",
    file: "lib/pool/record.ts",
    find: "  for (const drop of division.dropped) {",
    replace: "  for (const drop of [] as typeof division.dropped) {",
    expect: 1,
  },
  {
    name: "Put the analytics cooldown on the session instead of the guild",
    file: "lib/analytics/consent.ts",
    find: "  if (consent.cooldownUntil && now.getTime() < consent.cooldownUntil.getTime()) {",
    replace: "  if (false) {",
    expect: 1,
  },
  {
    name: "Ignore the platform ceiling on one server's refresh",
    file: "lib/analytics/consent.ts",
    find: "  if (used >= ceiling) {",
    replace: "  if (false) {",
    expect: 1,
  },
  {
    // ===== TWO PATHS, TWO MUTATIONS =====
    //
    // `discordLinkOutcome` and `emailLinkOutcome` end in the same two lines,
    // character for character. Written as one mutation it silently tested the
    // Discord path only — `String.replace` takes the first occurrence — and
    // reported itself caught, which said nothing at all about email. The
    // preflight added this sprint is what surfaced it.
    name: "Merge two accounts when a gamer links an already-used Discord identity",
    file: "lib/identity/credentials.ts",
    find:
      "    .where(eq(schema.users.discordId, discordId));\n\n" +
      '  if (!holder) return { kind: "free" };\n' +
      '  if (holder.id === userId) return { kind: "mine" };',
    replace:
      "    .where(eq(schema.users.discordId, discordId));\n\n" +
      '  if (!holder) return { kind: "free" };\n' +
      '  return { kind: "free" };',
    expect: 1,
  },
  {
    name: "Merge two accounts when a gamer links an already-used email",
    file: "lib/identity/credentials.ts",
    find:
      "    .where(eq(schema.users.email, address));\n\n" +
      '  if (!holder) return { kind: "free" };\n' +
      '  if (holder.id === userId) return { kind: "mine" };',
    replace:
      "    .where(eq(schema.users.email, address));\n\n" +
      '  if (!holder) return { kind: "free" };\n' +
      '  return { kind: "free" };',
    expect: 1,
  },
  {
    name: "Create a second row when a gamer links their second method",
    file: "lib/identity/credentials.ts",
    find: "  await db.update(schema.users).set({ discordId }).where(eq(schema.users.id, userId));",
    replace:
      "  const { uid } = await import(\"../core/utils.ts\");\n" +
      "  const fresh = uid();\n" +
      "  await db.insert(schema.users).values({\n" +
      "    id: fresh,\n" +
      "    slug: `gamer-${fresh.toLowerCase()}`,\n" +
      "    displayName: discordId,\n" +
      "    discordId,\n" +
      "  });",
    expect: 1,
  },
];

/** Which suites noticed. Parsed from the runner's own output. */
function failingSuites(output: string): string[] {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  const suites = new Set<string>();
  let current = "";
  for (const line of clean.split("\n")) {
    const header = /^(band\d\/\S+\.test\.ts)$/.exec(line.trim());
    if (header) current = header[1];
    else if (/^\s*✗/.test(line) && current) suites.add(current);
  }
  return [...suites];
}

// ===== A BAND THAT NEVER RAN LOOKS EXACTLY LIKE A BAND THAT CAUGHT NOTHING ==
//
// Sprint 16's run reported *"Join the guild's current name instead of the
// stored one — caught by 0"*, and the hole was not in the band. Re-running that
// one mutation through this same `spawn` caught it immediately, in the suite
// that has asserted W5 since Sprint 13: `99-week-record`, 517/518, exit 1.
//
// What had happened is that `next build` was running on the same machine at the
// time, and the band process died without printing a suite. `failingSuites` saw
// no `✗`, returned `[]`, and `[]` is the same answer it gives for a band that
// genuinely noticed nothing — so the harness accused the band of a hole it did
// not have, and it would have accused it just as confidently if the spawn had
// failed outright.
//
// That is the harness's version of the defect it exists to find: **a result
// nobody checked was produced**. A run is now only a result if it printed its
// own summary line, and the totals have to match the run before it — a band
// that lost eleven suites is a broken run, not a mutation nobody caught.
type BandRun = { output: string; total: number | null };

const SUMMARY = /^(\d+)\/(\d+) passed · \d+ assertions · (\d+) suites$/m;

function runBand(): Promise<BandRun> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "tests/run.mts"], {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", () => {
      const clean = out.replace(/\x1b\[[0-9;]*m/g, "");
      const summary = SUMMARY.exec(clean);
      resolve({ output: out, total: summary ? Number(summary[2]) : null });
    });
  });
}

/**
 * Stop, rather than report a number that was never measured.
 *
 * Loudly and with the tail of the output, because *"the band did not run"* is
 * only actionable if you can see what it said instead — and the most likely
 * cause is something else on the machine, which is invisible by the time
 * anybody reads the report.
 */
function refuseIncompleteRun(mutation: Mutation, run: BandRun, expected: number | null): void {
  const reason =
    run.total === null
      ? "the band printed no summary line, so it did not finish"
      : `the band reported ${run.total} tests, and the run before it reported ${expected}`;

  console.error(`\n\x1b[31mThe band did not complete under "${mutation.name}".\x1b[0m`);
  console.error(`  ${reason}.\n`);
  console.error("  Last lines of its output:\n");
  for (const line of run.output.trimEnd().split("\n").slice(-12)) console.error(`    ${line}`);
  console.error(
    "\n  This is NOT a mutation caught by zero suites — it is a run that produced " +
      "no answer. Reporting it as a hole would send somebody looking for a missing " +
      "assertion that is already there. Re-run with nothing else heavy on the " +
      "machine; `next build` alongside this harness is how it happened the first time.",
  );
}

// ===== The restore guarantee =====
//
// `outstanding` holds the original bytes of whatever is currently mutated. The
// signal handlers exist for the interrupt case specifically: a Ctrl-C halfway
// through a four-minute run is the most likely way this harness ever gets
// stopped, and it is the case where leaving a mutation behind would be least
// noticed.
const outstanding = new Map<string, string>();

async function restoreAll(): Promise<void> {
  for (const [file, original] of outstanding) {
    await fs.writeFile(path.join(repoRoot, file), original, "utf8");
  }
  outstanding.clear();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // Synchronous, because an async handler may not finish before exit.
    for (const [file, original] of outstanding) {
      try {
        writeFileSync(path.join(repoRoot, file), original, "utf8");
        console.error(`Restored ${file}.`);
      } catch (e) {
        console.error(
          `COULD NOT RESTORE ${file} — restore it by hand before trusting a run. ${String(e)}`,
        );
      }
    }
    process.exit(130);
  });
}
process.on("uncaughtException", async (e) => {
  await restoreAll();
  console.error(e);
  process.exit(1);
});

// ===== REFUSE TO START ON A DIRTY TREE =====
//
// The signal handler above restores on SIGINT and SIGTERM. It cannot help
// against SIGKILL, a power cut, or a process supervisor that does not ask —
// and a run killed that way leaves a mutation on disk, where the next thing
// anybody does is run the band and get a result nobody chose.
//
// It has happened twice: a ten-minute timeout, and a background job the
// harness never saw stop. Both left one file broken. So the *second* line of
// defence is at startup rather than at exit, which is the one place a killed
// run can still be caught — by the run after it.
//
// Reported by name, because "the tree is dirty" is not actionable and
// "lib/money/amounts.ts is modified" is.
async function refuseDirtyTree(): Promise<void> {
  const status = await new Promise<string>((resolve) => {
    const child = spawn("git", ["status", "--porcelain"], { cwd: repoRoot });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.on("close", () => resolve(out));
  });

  const dirty = status
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // Build artefacts are not evidence of anything and change on every run.
    .filter((l) => !l.endsWith("tsconfig.tsbuildinfo"));

  if (dirty.length === 0) return;

  console.error("The working tree is not clean, so this harness will not start.\n");
  for (const line of dirty) console.error(`  ${line}`);
  console.error(
    "\nEvery mutation is applied to a real file and restored from the bytes read " +
      "before it. Starting from a tree somebody has already edited means restoring " +
      "to a state nobody chose — and a previous run killed with SIGKILL is exactly " +
      "how a mutation ends up sitting here.\n\n" +
      "Commit or stash, and check nothing above is a mutation left behind.",
  );
  process.exit(1);
}

await refuseDirtyTree();

/**
 * ===== EVERY MUTATION IS CHECKED BEFORE ANY MUTATION IS RUN =====
 *
 * The loop below already reports a `find` that does not match — but it reports
 * it *when it reaches that mutation*, which on a full run is over an hour
 * after the typo was made. I made that typo (two spaces of indentation, not
 * four) and found out an hour and a half later.
 *
 * Worse, a `find` matching **two** places was silently mutating only the
 * first, because `String.replace` with a string takes the first occurrence.
 * That is the trap-8 shape at one remove: the break appears to be applied, the
 * band goes green, and the report reads as a hole in the suite rather than a
 * defect in the harness.
 *
 * So: exactly one occurrence, every mutation, before anything is written.
 */
{
  const problems: string[] = [];
  for (const mutation of MUTATIONS) {
    const source = await fs.readFile(path.join(repoRoot, mutation.file), "utf8");
    const hits = source.split(mutation.find).length - 1;
    if (hits === 0) {
      problems.push(`  ${mutation.name}\n    no longer matches anything in ${mutation.file}`);
    } else if (hits > 1) {
      problems.push(
        `  ${mutation.name}\n    matches ${hits} places in ${mutation.file} — only the ` +
          `first would be mutated, so the other ${hits - 1} would go untested while the ` +
          `report claimed otherwise`,
      );
    }
  }
  if (problems.length > 0) {
    console.error(
      `\x1b[31m${problems.length} mutation${problems.length === 1 ? "" : "s"} cannot be ` +
        `applied as written.\x1b[0m\n`,
    );
    for (const p of problems) console.error(p);
    console.error(
      "\nNothing has been written. A mutation that cannot apply proves nothing, and " +
        "an hour of run time is too long to find that out.",
    );
    process.exit(1);
  }
}

console.log(`Mutation harness — ${MUTATIONS.length} mutations\n`);

type Result = { mutation: Mutation; caught: string[]; applied: boolean };
const results: Result[] = [];

// How many tests the band collected last time it finished. The first completed
// run sets it; every run after has to agree. A mutation that changes the number
// of tests the runner can even collect has broken the run, not the band.
let bandTotal: number | null = null;

for (const mutation of MUTATIONS) {
  const full = path.join(repoRoot, mutation.file);
  const original = await fs.readFile(full, "utf8");

  if (!original.includes(mutation.find)) {
    // Loudly, not silently. A mutation that does not apply reports as
    // "caught by zero", which reads exactly like a genuine hole.
    console.log(`\x1b[33m⚠\x1b[0m  ${mutation.name}`);
    console.log(`   The line it mutates is no longer in ${mutation.file}.`);
    console.log(`   Update the harness — a mutation that cannot apply proves nothing.\n`);
    results.push({ mutation, caught: [], applied: false });
    continue;
  }

  try {
    outstanding.set(mutation.file, original);
    await fs.writeFile(full, original.replace(mutation.find, mutation.replace), "utf8");

    const run = await runBand();
    if (run.total === null || (bandTotal !== null && run.total !== bandTotal)) {
      refuseIncompleteRun(mutation, run, bandTotal);
      await restoreAll();
      process.exit(1);
    }
    bandTotal = run.total;

    const caught = failingSuites(run.output);
    results.push({ mutation, caught, applied: true });

    const mark = caught.length >= mutation.expect ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(
      `${mark} ${mutation.name} — caught by ${caught.length} ` +
        `(expected ≥ ${mutation.expect})`,
    );
    if (caught.length > 0) console.log(`   ${caught.join(", ")}`);
    console.log();
  } finally {
    await fs.writeFile(full, original, "utf8");
    outstanding.delete(mutation.file);
    // Verify the restore rather than assuming it. This is the check the test
    // plan asks for: "confirm the break was actually reverted".
    const after = await fs.readFile(full, "utf8");
    if (after !== original) {
      console.error(`\x1b[31mRESTORE FAILED for ${mutation.file}\x1b[0m`);
      process.exit(1);
    }
  }
}

// ── The report ──────────────────────────────────────────────────────────────

const holes = results.filter((r) => r.applied && r.caught.length === 0);
const thin = results.filter((r) => r.applied && r.caught.length === 1 && r.mutation.expect <= 1);
const short = results.filter((r) => r.applied && r.caught.length < r.mutation.expect);
const stale = results.filter((r) => !r.applied);

console.log("─".repeat(70));

if (holes.length > 0) {
  console.log(`\n\x1b[31mA mutation caught by zero suites is a hole.\x1b[0m`);
  for (const h of holes) console.log(`  \x1b[31m${h.mutation.name}\x1b[0m`);
}

if (short.length > holes.length) {
  console.log(`\n\x1b[31mCaught by fewer suites than expected:\x1b[0m`);
  for (const s of short.filter((x) => x.caught.length > 0)) {
    console.log(`  ${s.mutation.name} — ${s.caught.length} of ${s.mutation.expect}`);
  }
}

if (thin.length > 0) {
  console.log(
    `\n\x1b[33mCaught by exactly one suite. One assertion is one edit away from none:\x1b[0m`,
  );
  for (const t of thin) console.log(`  ${t.mutation.name} — ${t.caught[0]}`);
}

if (stale.length > 0) {
  console.log(`\n\x1b[33mMutations that no longer apply, and prove nothing:\x1b[0m`);
  for (const s of stale) console.log(`  ${s.mutation.name} (${s.mutation.file})`);
}

const passed = results.filter((r) => r.applied && r.caught.length >= r.mutation.expect).length;
console.log(
  `\n${passed}/${MUTATIONS.length} mutations caught by at least the expected number of suites.`,
);

await restoreAll();
process.exit(holes.length > 0 || short.length > 0 || stale.length > 0 ? 1 : 0);
