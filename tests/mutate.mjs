#!/usr/bin/env node
/**
 * DOES THE TEST BAND NOTICE WHEN THE PRODUCT BREAKS?
 *
 * ===== WHY THIS EXISTS =====
 *
 * 99 green suites did not catch a mission system with no importer, a quest
 * action fired by nothing, or an ownership proof consulted by nothing on the
 * money path. Green is not evidence. The only question that matters about a
 * test is whether it can tell correct code from broken code, and the only way
 * to answer it is to break the code and watch.
 *
 * This does that mechanically. Each mutation below is a small, plausible,
 * SILENT change — the kind a tired person makes at 2am — and the harness
 * reports how many suites noticed.
 *
 *   node tests/mutate.mjs                 # every mutation
 *   node tests/mutate.mjs money ladder    # only those
 *   node tests/mutate.mjs --list
 *
 * A mutation caught by ZERO suites is a hole in the band, and the report says
 * so in those words. A mutation caught by one is worth looking at too: one
 * assertion is one edit away from none.
 *
 * ===== IT ALWAYS PUTS THE FILE BACK =====
 *
 * Every mutation is applied to a file that is backed up first and restored in
 * a `finally`, plus a `process.on("exit")` net. A harness that can leave a
 * repository mutated is worse than no harness: the next person's test run is
 * lying to them and they have no idea why.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Each mutation names an invariant somebody could break by accident.
 *
 * `expect` is the MINIMUM number of suites that should notice. It is not a
 * target to tune — it is a claim about how well guarded the invariant is, and
 * lowering one to make the report green is the exact failure this file exists
 * to prevent.
 */
const MUTATIONS = [
  {
    id: "money",
    what: "Move 10% of every challenge from the prize pool to Cluster",
    why: "Takes $35 per challenge from gamers and gives it to the house. Silent.",
    file: "lib/vault-split.ts",
    from: "  prize: 50,\n  cluster: 20,",
    to: "  prize: 40,\n  cluster: 30,",
    expect: 2,
  },
  {
    id: "ladder",
    what: "Raise the earning floor from 10 linked members to 50",
    why: "The 500-vs-10 defect, resurrected. Owners who qualify are told they do not.",
    file: "lib/ladder.ts",
    from: "    threshold: 10,",
    to: "    threshold: 50,",
    expect: 1,
  },
  {
    id: "participation",
    what: "Delete the flat participation share",
    why: "Small servers that carried an entrant stop being paid anything at all.",
    file: "lib/server-score.ts",
    from: "export const PARTICIPATION_SHARE = 20;",
    to: "export const PARTICIPATION_SHARE = 0;",
    expect: 1,
  },
  {
    id: "proof",
    what: "Make every account count as ownership-proven",
    why: "A verification tick on an unproven account, everywhere it is shown.",
    file: "lib/account-ownership.ts",
    from: 'return ["icon", "vc", "oauth", "openid", "admin"].includes(method);',
    to: "return true;",
    expect: 1,
  },
  {
    id: "onboarding",
    what: "Let a half-onboarded gamer enter a challenge",
    why: "B94: a trophy won by somebody whose age and country we never captured.",
    file: "lib/challenges.ts",
    from: 'if (!state.unlocked) return { ok: false, reason: "onboarding" };',
    to: "if (false) return { ok: false, reason: \"onboarding\" };",
    expect: 1,
  },
  {
    id: "scrub",
    what: "Stop scrubbing secrets out of provider error text",
    why: "sync_error renders on the gamer's own profile. This puts a key on a web page.",
    file: "lib/providers/adapters.ts",
    from: "export function scrubSecrets(s: string): string {\n  let out = s;",
    to: "export function scrubSecrets(s: string): string {\n  return s;\n  let out = s;",
    expect: 1,
  },
  {
    id: "dedupe",
    what: "Forget which guilds already received a post",
    why: "Every cron re-run posts the same announcement again. Servers mute the bot.",
    file: "lib/discord/week-feed.ts",
    from: "export async function postedGuilds(",
    to: "export async function postedGuilds_disabled(",
    expect: 1,
  },
  {
    id: "staleid",
    what: "Re-point a PROVEN account's id after a provider key change",
    why: "Hands somebody else's account to whoever holds that Riot ID today.",
    file: "lib/sync.ts",
    from: 'if (isProof(account.verifiedMethod ?? "")) {',
    to: "if (false) {",
    expect: 1,
  },
];

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const m of MUTATIONS) console.log(`${m.id.padEnd(14)} ${m.what}`);
  process.exit(0);
}
const picked = args.length ? MUTATIONS.filter((m) => args.includes(m.id)) : MUTATIONS;
if (!picked.length) {
  console.error(`No mutation matched. Try --list.`);
  process.exit(1);
}

// ===== The safety net =====
//
// `restore` is idempotent and registered on exit as well as run in `finally`,
// so a crash, a Ctrl-C or a thrown assertion still puts the tree back.
const open = new Map();
const restore = () => {
  for (const [file, original] of open) writeFileSync(file, original);
  open.clear();
};
process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(130); });

async function band() {
  try {
    const { stdout } = await run("node", ["tests/run-all.mjs"], {
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, DEMO_DB: "1" },
    });
    return stdout;
  } catch (e) {
    // A failing band exits non-zero, which is the normal case here.
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

/** Which suites failed, from the runner's own summary. */
function caughtBy(out) {
  const at = out.indexOf("suites FAILED:");
  if (at < 0) return [];
  return [...out.slice(at).matchAll(/tests\/\S+\.mm?[jt]s/g)].map((m) => m[0]);
}

console.log(`Running ${picked.length} mutation(s). Each one runs the whole band, so this is slow on purpose.\n`);

const report = [];
for (const m of picked) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    // The anchor moved. Reporting this as a pass would be the harness lying.
    report.push({ ...m, caught: [], error: "ANCHOR NOT FOUND — the mutation could not be applied" });
    console.log(`  ??  ${m.id.padEnd(14)} anchor not found in ${m.file}`);
    continue;
  }
  open.set(m.file, original);
  try {
    writeFileSync(m.file, original.replace(m.from, m.to));
    const caught = caughtBy(await band());
    report.push({ ...m, caught });
    const mark = caught.length === 0 ? "!!" : caught.length < m.expect ? " ~" : " ok";
    console.log(`  ${mark}  ${m.id.padEnd(14)} caught by ${caught.length} suite(s)${caught.length ? `: ${caught.join(", ")}` : ""}`);
  } finally {
    writeFileSync(m.file, original);
    open.delete(m.file);
  }
}

console.log("\n──────── sensitivity report ────────");
let holes = 0, thin = 0;
for (const r of report) {
  if (r.error) { console.log(`\n${r.id}: ${r.error}`); holes++; continue; }
  const verdict = r.caught.length === 0 ? "NOT CAUGHT — nothing in the band notices this"
    : r.caught.length < r.expect ? `thin — ${r.caught.length} of an expected ${r.expect}`
      : `caught by ${r.caught.length}`;
  if (r.caught.length === 0) holes++;
  else if (r.caught.length < r.expect) thin++;
  console.log(`\n${r.id} — ${r.what}`);
  console.log(`  risk    ${r.why}`);
  console.log(`  verdict ${verdict}`);
  if (r.caught.length) console.log(`  by      ${r.caught.join("\n          ")}`);
}
console.log(`\n${report.length - holes - thin} well guarded · ${thin} thin · ${holes} UNGUARDED`);
process.exit(holes ? 1 : 0);
