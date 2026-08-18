// What has to be true of a deploy, asserted from the repository.
//
// ===== §0.1 FOR THE TENTH TIME, AND THIS ONE TOOK PRODUCTION DOWN =====
//
// `scripts/migrate.mts` was written, was correct, and said so in its own
// header: *"On Vercel this is the build command's first step."* It was not.
// `package.json` said `"build": "next build"`, so across every deploy the
// migrator ran **zero times**, the Neon database had **zero tables**, and the
// homepage answered 500 with `relation "challenges" does not exist`.
//
// The same shape as `SCREENS` being empty, as `mayWithdraw` being read by no
// card, as `emailLinkOutcome` being called by nothing: a thing proven to
// **exist**, with nothing proving anything **reads** it. Every band was green
// the whole time, because every band tested the migrator and none tested
// whether anybody ran it.
//
// So both halves are asserted here, and neither can be satisfied by a file
// that merely exists:
//
//   * the build command calls the migrator, before the build
//   * every cron route has a schedule, and every schedule has a route
//
// The route set is **discovered from disk**, not typed into this file. A
// hand-kept list only guards the routes somebody remembered, and the one
// somebody forgets is the one that silently never fires — which is the exact
// failure this file exists to end.

import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..", "..");

async function readJson<T>(rel: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(repoRoot, rel), "utf8")) as T;
}

test("the build command runs the migrator, and runs it first", async () => {
  // Guard 53's shape, applied to the script that was actually wrong. That one
  // asserts `npm test` typechecks before the band; this asserts `npm run
  // build` migrates before the build — same reasoning, and this time the
  // failure it prevents is a 500 on the homepage rather than a slow review.
  const pkg = await readJson<{ scripts?: Record<string, string> }>("package.json");
  const build = pkg.scripts?.build ?? "";

  ok(/db:migrate/.test(build), `the build command runs the migrator: ${build}`);
  ok(
    build.indexOf("db:migrate") < build.indexOf("next build"),
    "and runs it BEFORE the build — a deploy whose schema never arrived should " +
      "fail at the migration, not serve 500s to everybody who visits",
  );

  // And the migrator still has to be a script somebody can call. The build
  // command referencing a script that does not exist fails only at deploy.
  ok(
    (pkg.scripts?.["db:migrate"] ?? "").includes("scripts/migrate.mts"),
    "and db:migrate still points at the migrator",
  );
});

test("every cron route has a schedule, and every schedule has a route", async () => {
  // ===== THE SECOND GAP: NO vercel.json AT ALL =====
  //
  // Three cron routes existed and shipped. Nothing scheduled them, so the gun
  // never fired, the sync never ran and the week never closed — on a platform
  // whose entire product is a weekly loop.
  const cronDir = path.join(repoRoot, "app", "api", "cron");
  const onDisk = (await fs.readdir(cronDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => `/api/cron/${e.name}`)
    .sort();

  const vercel = await readJson<{ crons?: { path: string; schedule: string }[] }>(
    "vercel.json",
  );
  const scheduled = (vercel.crons ?? []).map((c) => c.path).sort();

  ok(onDisk.length > 0, "there are cron routes to schedule");
  eq(
    scheduled.join(", "),
    onDisk.join(", "),
    "every cron route is scheduled and every schedule points at a real route",
  );

  // A path that is scheduled must actually answer. A directory with no
  // `route.ts` is a folder, not an endpoint, and Vercel would call it forever.
  for (const p of scheduled) {
    const file = path.join(repoRoot, "app", p.replace(/^\//, ""), "route.ts");
    ok(
      await fs.stat(file).then(() => true, () => false),
      `${p} has a route.ts behind it`,
    );
  }
});

test("the schedules are the cadences 01-CYCLE names, read out of the document", async () => {
  // 94-reachability reads 04 §5's route list out of the document rather than
  // keeping a copy. Same here: the cadences come from 01-CYCLE's own table, so
  // changing the document without changing the schedule fails the band.
  //
  // Matched as **sets**, deliberately. A job-name-to-route-name map would be
  // the hand-kept list this file is trying not to have, and the set catches
  // what actually goes wrong — a cadence quietly becoming a different one.
  const doc = await fs.readFile(path.join(repoRoot, "docs", "01-CYCLE.md"), "utf8");
  const after = doc.slice(doc.indexOf("### The cron jobs")).split("\n");
  // Bounded to this table's own body. Reading to the end of the document
  // swallows the next table's header row, and "Where" is not a cadence — the
  // first run of this guard failed on exactly that, which is the guard working.
  const start = after.findIndex((l) => /^\|/.test(l));
  const body: string[] = [];
  for (const line of after.slice(start)) {
    if (!/^\|/.test(line)) break;
    body.push(line);
  }
  const rows = body
    .filter((l) => !/^\|\s*-+/.test(l) && !/\|\s*Job\s*\|/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((c) => c.length > 2 && c[1]);

  const CRON_FOR: Record<string, string> = {
    hourly: "0 * * * *",
    "every 5 minutes": "*/5 * * * *",
    daily: "0 0 * * *",
  };

  const wanted = rows.map((c) => {
    const cadence = c[2].toLowerCase();
    const expr = CRON_FOR[cadence];
    ok(
      expr !== undefined,
      `01-CYCLE's cadence "${c[2]}" has a cron expression. A new cadence in the ` +
        `document needs one here, or a job ships unscheduled`,
    );
    return expr;
  });

  const vercel = await readJson<{ crons?: { path: string; schedule: string }[] }>(
    "vercel.json",
  );
  const actual = (vercel.crons ?? []).map((c) => c.schedule).sort();

  eq(rows.length, 3, "01-CYCLE names three cron jobs");
  eq(
    actual.join(", "),
    [...wanted].sort().join(", "),
    "and vercel.json schedules exactly those cadences",
  );
});

test("preflight knows every variable 10-SETUP names", async () => {
  // ===== A RETYPED LIST IS ONLY SAFE IF SOMETHING FAILS WHEN IT DRIFTS =====
  //
  // House rule 2 says import numbers, never retype them. `lib/site/preflight.ts`
  // retypes the variable list anyway, and the reason is in its header: `docs/`
  // is not deployed, so a page that parsed the document at runtime would work
  // locally and render blank in production — the exact class of bug the page
  // exists to catch.
  //
  // So the copy is held to the document here instead. Adding a variable to
  // 10-SETUP without adding it to preflight fails the band, which makes the
  // document the authority even though the page cannot read it.
  const doc = await fs.readFile(path.join(repoRoot, "docs", "10-SETUP.md"), "utf8");
  const setup = new Set(
    [...doc.slice(0, doc.indexOf("## 2 ·")).matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)].map(
      (m) => m[1],
    ),
  );

  const { ENV_SPEC } = await import("../../lib/site/preflight.ts");
  const known = new Set(ENV_SPEC.map((v) => v.name));

  const missing = [...setup].filter((n) => !known.has(n)).sort();
  eq(
    missing.join(", "),
    "",
    "every variable 10-SETUP §1 names appears on /admin/preflight, or the owner " +
      "has no way to see that it is missing",
  );

  // ===== AND THE ONE THE DOCUMENT DOES NOT NAME =====
  //
  // `CRON_SECRET` is load-bearing and absent from 10-SETUP §1. Without it
  // `authoriseCron` fails closed, so all three jobs answer 401 and the weekly
  // cycle silently never runs — verified against the live deployment, which
  // answered 401 on all three before it was set.
  //
  // Asserted as required here **because the code requires it**. If somebody
  // later adds it to the document, this assertion keeps passing; if somebody
  // removes it from preflight, the owner loses the only signal that the whole
  // cycle is dead.
  const cron = ENV_SPEC.find((v) => v.name === "CRON_SECRET");
  ok(cron !== undefined && cron.required, "CRON_SECRET is listed, and listed as required");
});

test("preflight cannot print a secret", async () => {
  // The page renders `envRows()`, and `envRows()` returns a boolean per
  // variable. There is no template edit that could leak a value, because the
  // value never reaches the template — which is a stronger guarantee than
  // remembering to redact one.
  const before = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "a-real-looking-secret-value-nobody-should-see";
  try {
    const { envRows } = await import("../../lib/site/preflight.ts");
    const serialised = JSON.stringify(envRows());
    ok(
      !serialised.includes("a-real-looking-secret-value"),
      "no secret value appears anywhere in what the page is handed",
    );
    ok(
      /"name":"AUTH_SECRET","group":"Required","required":true/.test(
        serialised.replace(/\s+/g, ""),
      ) || serialised.includes("AUTH_SECRET"),
      "while the variable itself is still reported by name",
    );
    const auth = envRows().find((v) => v.name === "AUTH_SECRET");
    eq(auth?.present, true, "and its presence is reported truthfully");
  } finally {
    if (before === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = before;
  }
});
