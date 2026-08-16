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
    name: "Store an admin role by name",
    file: "lib/discord/admin.ts",
    find: "  if (!/^\\d+$/.test(roleId)) {",
    replace: "  if (false) {",
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

function runBand(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "tests/run.mts"], {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", () => resolve(out));
  });
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
        require("node:fs").writeFileSync(path.join(repoRoot, file), original, "utf8");
      } catch {
        console.error(`COULD NOT RESTORE ${file} — restore it by hand before trusting a run.`);
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

console.log(`Mutation harness — ${MUTATIONS.length} mutations\n`);

type Result = { mutation: Mutation; caught: string[]; applied: boolean };
const results: Result[] = [];

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
    const caught = failingSuites(await runBand());
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
