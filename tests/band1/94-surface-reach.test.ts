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
    [],
    "a library module no page and no route can reach is a feature with no surface — " +
      "which is how three sprints shipped complete, guarded and invisible",
  );
});
