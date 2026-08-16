// Every door leads somewhere.
//
// ===== WHY THIS SUITE EXISTS =====
//
// Sprint 3 deleted `/api/portal/unlock` and left `app/login/[kind]/page.tsx`
// behind — a page still describing the deleted portal-key model, whose form
// posted to a route that no longer existed. Three live call sites redirected
// into it. **A brand could not sign in at all**, and every error path landed
// them on a form that 404'd on submit.
//
// Typecheck was clean. The band was green at 264/264. Nothing catches a broken
// string, because a route is a string and TypeScript has no opinion about it.
//
// So: walk the tree, extract every internal path this codebase sends somebody
// to or posts to, and prove each one resolves to a file that exists. Walked,
// never listed — a hand-maintained list of routes only guards the routes
// somebody remembered, which is the same failure one level up.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const appDir = path.join(repoRoot, "app");
// ===== `lib/` TOO, AND THAT WAS A HOLE IN THE FIRST VERSION =====
//
// The first version of this suite walked `app/` only, and the very break that
// was supposed to prove it — a redirect in `lib/portal/session.ts` pointing at
// `/login/brands` — went straight through. Two of the three call sites that
// caused the original bug live in `lib/`. A guard that covers the surface but
// not the code that redirects into it is guarding the easy half.
const sourceDirs = [appDir, path.join(repoRoot, "lib")];

async function walkSources(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of sourceDirs) out.push(...(await walk(dir)));
  return out;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Every route the app actually serves, as a matcher.
 *
 * Built by walking `app/` for `page.tsx` and `route.ts`, which is the only
 * definition of "a route exists" that cannot drift from the truth. A dynamic
 * segment becomes a wildcard, because `/portal/brand/abc` is served by
 * `/portal/brand/[brandId]`.
 */
async function servedRoutes(): Promise<{ pages: RegExp[]; handlers: RegExp[] }> {
  const pages: RegExp[] = [];
  const handlers: RegExp[] = [];

  for (const file of await walk(appDir)) {
    const base = path.basename(file);
    if (base !== "page.tsx" && base !== "route.ts") continue;

    const rel = path.relative(appDir, path.dirname(file));
    const segments = rel === "" ? [] : rel.split(path.sep);
    // Route groups — `(marketing)` — are not part of the URL.
    const urlSegments = segments.filter((s) => !s.startsWith("("));

    const pattern =
      "^" +
      (urlSegments.length === 0
        ? "/"
        : "/" +
          urlSegments
            .map((s) => (s.startsWith("[") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
            .join("/")) +
      "$";
    (base === "page.tsx" ? pages : handlers).push(new RegExp(pattern));
  }
  return { pages, handlers };
}

/** Strip a query string and a hash — a route is the path. */
function pathOnly(target: string): string {
  return target.split("?")[0].split("#")[0];
}

/**
 * Internal paths this file sends a browser to.
 *
 * Deliberately narrow: literal strings, and template literals whose
 * interpolations are replaced by a placeholder segment. A path built from a
 * variable this walker cannot see is not something it can check, and pretending
 * otherwise would make the guard's coverage a guess.
 */
function redirectTargets(src: string): string[] {
  const out: string[] = [];
  // `redirect("/x")`, `back(request, "/x", …)`, `new URL("/x", …)`
  for (const m of src.matchAll(/\b(?:redirect|back)\s*\(\s*(?:request\s*,\s*)?["'`](\/[^"'`]*)["'`]/g)) {
    out.push(m[1]);
  }
  for (const m of src.matchAll(/new URL\(\s*["'`](\/[^"'`]*)["'`]/g)) out.push(m[1]);
  // `href="/x"` on a Link or an anchor.
  for (const m of src.matchAll(/href=["'](\/[^"'#]*)["']/g)) out.push(m[1]);
  // `href={`/x/${id}`}` — the interpolation becomes one segment.
  for (const m of src.matchAll(/href=\{`(\/[^`]*)`\}/g)) out.push(m[1]);
  return out.map(normalisePath);
}

/**
 * Turn a template literal into a checkable path.
 *
 * An interpolation that is a **whole segment** — `/u/${slug}` — becomes a
 * wildcard, because that is what the route serves. One **glued to a segment**
 * — `/challenges${query}` — is dropped, because it is almost always a query
 * string and never a route segment. Replacing it with a character instead
 * invents a path nobody navigates to, which is a false failure, and a guard
 * that cries wolf is a guard somebody switches off.
 */
function normalisePath(target: string): string {
  return pathOnly(target)
    .replace(/\/\$\{[^}]*\}/g, "/x")
    .replace(/\$\{[^}]*\}/g, "");
}

/** Form actions — the thing that 404s on submit rather than on click. */
function formActions(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/action=["'](\/[^"']*)["']/g)) out.push(m[1]);
  for (const m of src.matchAll(/action=\{`(\/[^`]*)`\}/g)) out.push(m[1]);
  // `action={endpoint}` where endpoint is a literal chosen above it.
  for (const m of src.matchAll(/=\s*["'](\/api\/[^"']*)["']/g)) out.push(m[1]);
  return out.map(normalisePath);
}

/** Paths that are deliberately external to the app router. */
const NOT_ROUTES = [
  "/", // matched by app/page.tsx, but also appears as a bare href — allowed either way
];

test("the walk finds the routes it is meant to guard", async () => {
  const { pages, handlers } = await servedRoutes();
  ok(pages.length > 10, `the walk found the pages (${pages.length})`);
  ok(handlers.length > 3, `and the route handlers (${handlers.length})`);
  ok(
    pages.some((p) => p.test("/login/brand")),
    "including /login/brand — the page whose absence broke brand sign-in",
  );
  ok(
    handlers.some((h) => h.test("/api/auth/brand")),
    "and /api/auth/brand, the handler its form posts to",
  );

  // The canary. Without this the walk could silently cover nothing outside
  // `app/`, which is exactly what the first version of this suite did.
  const files = await walkSources();
  ok(
    files.some((f) => f.includes(`${path.sep}lib${path.sep}portal${path.sep}session.ts`)),
    "and the walk reaches lib/, where two of the three broken redirects lived",
  );
});

test("every redirect target in the app resolves to a page or a handler", async () => {
  const { pages, handlers } = await servedRoutes();
  const broken: string[] = [];

  for (const file of await walkSources()) {
    const src = await fs.readFile(file, "utf8");
    for (const target of redirectTargets(src)) {
      if (NOT_ROUTES.includes(target)) continue;
      const served =
        pages.some((p) => p.test(target)) || handlers.some((h) => h.test(target));
      if (!served) broken.push(`${path.relative(repoRoot, file)} → ${target}`);
    }
  }

  eq(
    broken,
    [],
    "a redirect to a route that does not exist is a dead end nobody sees until " +
      "they hit it — and typecheck cannot see it at all, because a route is a string",
  );
});

test("every form action posts to a route handler that exists", async () => {
  // The sharper half. A broken `href` is a 404 somebody notices immediately;
  // a broken `action` is a form that looks completely fine until it is
  // submitted, with whatever the person typed already gone.
  const { pages, handlers } = await servedRoutes();
  const broken: string[] = [];

  for (const file of await walk(appDir)) {
    const src = await fs.readFile(file, "utf8");
    // Only files that actually render a form. `=  "/api/…"` picks up constants
    // elsewhere, and a constant that is never posted to is not a broken form.
    if (!/<form/.test(src)) continue;

    for (const target of formActions(src)) {
      if (!target.startsWith("/api/")) continue;
      if (!handlers.some((h) => h.test(target))) {
        broken.push(`${path.relative(repoRoot, file)} → ${target}`);
      }
    }
  }

  eq(broken, [], "every form posts somewhere that can answer it");
});

/**
 * Everything that is not a comment.
 *
 * The first version of this check exempted any file mentioning "one-time
 * invite" anywhere, which meant the brand login page — which legitimately
 * says that — became exempt from the whole rule, and a break putting *"Sign
 * in with your portal key"* into its heading sailed through.
 *
 * Comments are stripped instead. A comment may explain that the key was
 * deleted; rendered copy may not offer one.
 */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/**
 * Every route `04-SURFACES.md` §5 promises, read out of the document itself.
 *
 * ===== WALKED FROM THE SPEC, NEVER LISTED HERE =====
 *
 * A hand-written list in this file would only guard the routes I remembered —
 * and forgetting is exactly what happened: six handlers existed, all under
 * `/api/auth`, and the other eight were in no sprint at all. Band 1 was green
 * on a platform where Discord could not reach us, no sync could run, no
 * payment could land, and the week could neither start nor end, because band 1
 * calls the libraries directly and never goes through HTTP.
 *
 * So the list comes from the specification. Add a route to §5 and this suite
 * demands it exist; delete one and the demand goes with it.
 */
async function specifiedApiRoutes(): Promise<string[]> {
  const doc = await fs.readFile(path.join(repoRoot, "docs", "04-SURFACES.md"), "utf8");
  const section = doc.split(/^## 5 · The public API$/m)[1] ?? "";
  const body = section.split(/^## /m)[0];

  const routes = new Set<string>();
  // Table cells like `| `/api/cron/sync` | Hourly stat pull |`, including the
  // rows that name two routes separated by a middle dot.
  for (const m of body.matchAll(/`(\/api\/[^`]+)`/g)) {
    routes.add(m[1].trim().replace(/\[[^\]]+\]/g, "x"));
  }
  return [...routes];
}

test("the spec's route list is actually being read", async () => {
  // The canary. If the section heading is renamed, this suite must fail loudly
  // rather than quietly guard an empty list — which is how a guard becomes
  // decoration.
  const routes = await specifiedApiRoutes();
  ok(routes.length >= 8, `the §5 table parsed (${routes.length} routes)`);
  ok(
    routes.some((r) => r === "/api/discord/interactions"),
    "including the bot's own endpoint",
  );
  ok(
    routes.some((r) => r.startsWith("/api/cron/")),
    "and the cron routes",
  );
});

test("every route the spec promises resolves to a handler that exists", async () => {
  // The gap this suite exists for, one level up from the last one: not "does
  // this link work" but "does the platform have the surface it says it has".
  const { handlers } = await servedRoutes();
  const missing = (await specifiedApiRoutes()).filter(
    (route) => !handlers.some((h) => h.test(route)),
  );

  eq(
    missing,
    [],
    "04-SURFACES §5 is a promise about what answers an HTTP request. A library " +
      "with no endpoint in front of it is a library nothing can call",
  );
});

test("no rendered copy offers a credential the platform deleted", async () => {
  // The other half of what went wrong: the stale page did not merely 404 on
  // submit, it *described the deleted model* — "access is by portal key, never
  // a password" — on a platform where S1 deleted the key and I1 added the
  // password. A dead route is a bug; a live page teaching the wrong rule is
  // worse, because somebody believes it.
  const offenders: string[] = [];
  for (const file of await walk(appDir)) {
    const src = withoutComments(await fs.readFile(file, "utf8"));
    if (/portal key/i.test(src)) offenders.push(path.relative(repoRoot, file));
  }
  eq(
    offenders,
    [],
    "S1 deleted the server-owner key — no surface may still offer one",
  );
});
