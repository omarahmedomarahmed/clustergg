// Does anything actually render this?
//
// ===== THE FOURTH TIME §0.1 ARRIVED, AND THE GUARD THAT ENDS IT =====
//
// Three sprints shipped a complete, correct, fully guarded library and **no
// page**:
//
//   * `lib/portal/spend.ts` — request → approve, 12 §6's central money rule.
//     No request screen. No approve screen.
//   * `lib/analytics/consent.ts` — the whole of 12 §7a. No analytics tab.
//   * `lib/admin/registry.ts` — all eight sections of 12 §8. No
//     `/admin/servers/[guildId]`.
//
// Every one had guards. Every guard called the module **directly**. Not one
// asked whether a surface did — which is the shape `docs/PLAN.md` §0.1 names:
// *something was proven to EXIST, nothing was proven to READ it.*
//
// `94-reachability` catches the other direction — a link or a route that
// points at nothing. This catches a module that nothing points at.
//
// ===== WHY IT IS TRANSITIVE, AND WHY THERE IS NO LIST =====
//
// "Called from `app/`" is too strict: most modules are legitimately reached
// through another module. "Called from anywhere" is too loose: all three
// modules above were called — by their tests. A test is not a surface.
//
// So the roots are the files under `app/`, and reachability follows imports
// through `lib/`. A module no app file can reach, however many tests import
// it, is a module nothing renders. **No allowlist**: rule 3 of 09 — a guard
// with a hand-maintained list only guards what somebody remembered, and
// forgetting is the entire defect here.

import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";

const IGNORE_DIRS = new Set(["node_modules", "screenshots", ".next", "drizzle"]);

/**
 * Modules whose surface is a **later sprint**, each with the sprint named.
 *
 * Not an escape hatch — every entry is checked below, and fails the band the
 * moment it stops describing something real: if the module gains a surface the
 * entry is spent, and if the module is deleted the entry has no subject.
 *
 * ===== EMPTY, AND THAT IS THE ALLOWANCE WORKING =====
 *
 * It carried six entries from Sprint 10a to Sprint 12, all of them the bot's:
 * the card renderer, its fonts, its upload rule, the admin-role mapping, and
 * Riot's approved-path list and icon proof. Sprint 12 built the card families,
 * and every one of the six went red here as it gained a surface — which is 09's
 * fifth rule doing exactly what it is for. *"An allowance that outlives what it
 * excused is how a deleted rule comes back."*
 *
 * Two of them were not simply waiting for a screen, and are worth naming:
 *
 *   `riot-methods.ts` was **the authority** on the 39 paths the personal key
 *   can call, and nothing consulted it. `riot-verify.ts` now checks every URL
 *   against it before the fetch, because an unapproved path returns a 403 that
 *   reads exactly like an expired key — and 10 §4 warns that sends whoever is
 *   debugging it to regenerate a key that has not expired.
 *
 *   `upload.ts` held *"nothing that is not PNG or JPEG reaches storage"* with
 *   no caller, so the rule was enforced by nobody. `/api/uploads` is its door.
 *
 * Keep this list empty. A new entry needs a sprint name and a date, and the
 * next session should read a non-empty one as work somebody deferred rather
 * than as a category of module that does not need a surface.
 */
const NOT_YET_RENDERED: readonly string[] = [];

type Module = { rel: string; abs: string; imports: string[]; hasFunction: boolean };

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Which modules this file imports, resolved to absolute paths.
 *
 * Both `import … from "x"` and `await import("x")` — the second matters, and
 * missing it would be a hole rather than a nuisance: `closeWeek` reaches
 * `record.ts` and `payouts.ts` through dynamic imports, and a guard that only
 * saw static ones would call both of them dead.
 */
async function importsOf(abs: string, src: string): Promise<string[]> {
  const path = await import("node:path");
  const out: string[] = [];
  const patterns = [
    /(?:^|\s)(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    // ===== `import "./x.ts"` — A SIDE-EFFECT IMPORT IS STILL AN EDGE =====
    //
    // Missing this made the guard *stricter* rather than looser, which is why
    // it surfaced as nine orphans rather than as a hole: the bot's screen
    // registry is filled by importing each family for its side effects, so
    // every card family read as unreachable while being perfectly reachable.
    //
    // Worth being exact that this does not weaken anything. The question this
    // suite asks is *can a page reach this module*, and a side-effect import
    // is one of the ways a page does. What it cannot tell you is whether the
    // module does anything once imported — which is a different question, and
    // `61-cards` is where it is asked.
    /(?:^|\s)import\s*["'](\.[^"']+)["']/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue;
      out.push(path.resolve(path.dirname(abs), spec));
    }
  }
  return out;
}

async function moduleGraph(): Promise<{ modules: Map<string, Module>; roots: string[] }> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);

  const files = [
    ...(await walk(path.join(repoRoot, "app"))),
    ...(await walk(path.join(repoRoot, "lib"))),
  ];

  const modules = new Map<string, Module>();
  const roots: string[] = [];
  for (const abs of files) {
    const src = await fs.readFile(abs, "utf8");
    const rel = path.relative(repoRoot, abs);
    modules.set(abs, {
      rel,
      abs,
      imports: await importsOf(abs, src),
      // A module of pure types or constants is not what this guard is about —
      // it cannot "have no surface" in any way a user would notice.
      hasFunction: /\bexport\s+(?:async\s+)?function\s/.test(src),
    });
    if (rel.startsWith("app/")) roots.push(abs);
  }
  return { modules, roots };
}

test("every library module is reachable from a page or a route handler", async () => {
  const { modules, roots } = await moduleGraph();

  // Breadth-first from every app file, following imports.
  const reached = new Set<string>(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const abs = queue.pop()!;
    const mod = modules.get(abs);
    if (!mod) continue;
    for (const target of mod.imports) {
      // A specifier may or may not carry its extension, and may be a folder.
      for (const candidate of [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
        if (modules.has(candidate) && !reached.has(candidate)) {
          reached.add(candidate);
          queue.push(candidate);
        }
      }
    }
  }

  // ===== THE CANARY, BEFORE THE GUARD IS TRUSTED =====
  //
  // `02-structural`'s first case is here for the same reason: a walk that
  // silently covered nothing would make this assertion pass over an empty
  // list, and two of the three defects it exists for would be invisible.
  ok(roots.length > 20, `the walk found ${roots.length} app files`);
  const libs = [...modules.values()].filter((m) => m.rel.startsWith("lib/") && m.hasFunction);
  ok(libs.length > 40, `and ${libs.length} library modules that export a function`);
  ok(
    libs.some((m) => m.rel === "lib/pool/score.ts"),
    "including the pool scorer, so the walk demonstrably reaches lib/",
  );
  ok(
    reached.has(libs.find((m) => m.rel === "lib/pool/score.ts")!.abs),
    "which is reachable — an all-unreachable answer would prove nothing",
  );

  const orphans = libs.filter((m) => !reached.has(m.abs)).map((m) => m.rel).sort();
  eq(
    orphans,
    [...NOT_YET_RENDERED].sort(),
    "a library module no page and no route can reach is a feature with no surface — " +
      "which is how three sprints shipped complete, guarded and invisible",
  );

  // ===== AND THE ALLOWANCE EXPIRES WITH ITS SUBJECT =====
  //
  // 09's fifth rule, learned expensively: *"an allowlist entry must still
  // describe something real or the suite fails. An allowance that outlives
  // what it excused is how a deleted rule comes back."*
  //
  // Two ways an entry stops being real, and both fail here rather than sitting
  // quietly: the module gets its surface (the reason is spent), or the module
  // is deleted (there is nothing left to excuse). Trap 19's other half — a
  // permanently red guard gets deleted, so this one carries a date instead.
  const known = new Set(libs.map((m) => m.rel));
  for (const excused of NOT_YET_RENDERED) {
    ok(
      known.has(excused),
      `${excused} is excused from needing a surface and no longer exists — ` +
        "remove the entry, because an allowance with no subject excuses the next thing that takes its name",
    );
    const mod = libs.find((m) => m.rel === excused)!;
    ok(
      !reached.has(mod.abs),
      `${excused} has a surface now — delete its line from NOT_YET_RENDERED, ` +
        "because an allowance that outlived its reason is a hole with a name",
    );
  }
});
