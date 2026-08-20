// Does anything actually CALL this?
//
// ===== THE THIRTEENTH OMISSION, AND THE TWO GUARDS THAT COULD NOT SEE IT ====
//
// `docs/15-DELIVERY.md` L12–L14. Two functions were written, correct, guarded,
// and delivered nothing:
//
//   * `dmUser` — a guild owner is never told Cluster is on their server, and
//     never told they have money waiting. Before they sign in a DM is the only
//     channel Discord gives us.
//   * `beginEmailVerification` — mints a six-digit code and **returns it**.
//     Both call sites drop it unless the platform is in demo mode. So
//     redemption needs a verified email, verification needs a code, the code
//     never arrives, and the money path is broken end to end in production.
//
// Neither existing guard could see either one, and for two *different*
// reasons, which is why this suite exists rather than an edit to one of them:
//
//   * `94-reachability` is about **route strings** — redirect targets, form
//     actions, and `04-SURFACES` §5's API table. A function is not a path. It
//     was never going to see either defect.
//   * `94-surface-reach` is about **modules**. `lib/discord/rest.ts` is
//     imported all over the app for `postMessage`; the *file* is reached, so
//     it is not an orphan, and the guard never descends to the export.
//     `lib/identity/verify.ts` is reached too — and worse, its function is
//     genuinely *called*. The defect is one level below both: the value it
//     returns goes nowhere.
//
// So this suite asks two questions no other guard asks. Both are about a
// symbol, not a file:
//
//   L12/L13 — is this exported function called from outside its own module?
//   L14     — when it is called, does anything in production use the answer?
//
// ===== WHY THE TWO HALVES NEED DIFFERENT MACHINERY =====
//
// L12 needs a **symbol-level import graph**: which file imports which export,
// following re-export chains, because `lib/trophies/redemption.ts` re-exports
// `beginEmailVerification` and a caller of the re-export is a real caller.
//
// L14 needs **call-expression-level** reading: find every call, and decide
// whether the value it produces reaches anything. A regex cannot do either, so
// this walks the TypeScript AST — the same parser the build uses, rather than
// a second opinion about what the source says.
//
// ===== "A TEST IS NOT A CALLER" IS THE LOAD-BEARING CLAUSE (L13) =====
//
// `tests/` is not walked at all. Every one of the modules `94-surface-reach`
// was written after was called — by its own tests — and that is exactly what
// made them look alive. The same trap one level down: `refreshGuild`,
// `awaitingReplyCounts` and `ownerPoolStates` are each called by precisely one
// thing on this branch, and it is a suite.
//
// And a caller that nothing calls is not a caller either. `startEmailVerification`
// wraps `beginEmailVerification` and *consumes* its return value — so counting
// it would have made L14 read green over the exact defect it was written for.
// It is itself an orphan, so its call sites do not count.

import ts from "typescript";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/**
 * Exported functions in `lib/` whose caller is a **later sprint**, each with
 * the sprint named.
 *
 * The same self-expiring shape as `NOT_YET_RENDERED` in `94-surface-reach`,
 * and for the same reason (09's fifth rule): an entry fails the band both when
 * it **gains** a caller — the excuse is spent — and when it **loses** its
 * function — there is nothing left to excuse. L13 states it directly.
 *
 * ===== WHAT THIS LIST IS, AND WHAT IT IS NOT =====
 *
 * The guard was committed red on **144** of these. The owner ruled on every
 * one, and this is what is left after the ruling was carried out:
 *
 *   * 28 were dead code and are deleted.
 *   * 12 were called only by their own tests — *a test is not a caller* — and
 *     each either gained the surface it was waiting for (`refreshGuild` got the
 *     Refresh button the page had been describing since Sprint 12,
 *     `awaitingReplyCounts` got the dashboard alert MS1 is about, `editTrophy`
 *     got the editor `/admin/trophies` promised in words, `freezeOnUnlink` got
 *     the unlink action that B6 had no trigger for) or went, with its test
 *     rewritten against the live path.
 *   * 5 were key verification for the portal credential S1 deleted, and went
 *     with the file — `lib/core/portal-auth.ts` is now `lib/core/signing.ts`.
 *
 * **Every entry below is an export that should never have been one.** Each is
 * used inside its own module and nowhere else, so the fix is to unexport it,
 * and that is a mechanical pass over sixty-four files with about twenty tests
 * to move — high churn, low value, and deferred to Sprint 18 as its own thing
 * rather than smuggled into a delivery sprint.
 *
 * This is **not** the shape the owner rejected for L14's other half. That list
 * would have excused eighteen functions that are not defects; every one of
 * these is a defect, with a date and a sprint against it.
 *
 * An entry is `<file> <function>` and deliberately carries no line number: a
 * line is not an identity, and a comment added above `dividePool` would break
 * an entry that describes something still true.
 */
const NOT_YET_CALLED: readonly string[] = [
  // ── Mobile Legends. The provider is marked `notLive` and the code stays.
  "lib/providers/mlbb.ts isMlbbConfigured",
  "lib/providers/mlbb.ts login",
  "lib/providers/mlbb.ts sendVerificationCode",

  // ── Sprint 18 · the unexport pass.
  "lib/admin/auth.ts departments",
  "lib/admin/registry.ts reassignmentState",
  "lib/admin/registry.ts transferStateOf",
  "lib/admin/setup.ts adminExists",
  "lib/admin/staff.ts isSuperAdmin",
  "lib/analytics/consent.ts consentFor",
  "lib/analytics/consent.ts cooldownForLoad",
  "lib/analytics/consent.ts lastSnapshot",
  "lib/analytics/consent.ts pullsInWindow",
  "lib/analytics/consent.ts refreshState",
  "lib/auth/session.ts seal",
  "lib/auth/session.ts unseal",
  "lib/cards/blob.ts blobBackend",
  "lib/cards/blob.ts blobConfigured",
  "lib/cards/render.ts cardTree",
  "lib/cards/specs.ts daysLeftLine",
  "lib/challenges/scoring.ts scoreFrom",
  "lib/challenges/series.ts billForPrize",
  "lib/challenges/series.ts templateTotalCents",
  "lib/challenges/week.ts dayEndFor",
  "lib/challenges/week.ts msUntilClose",
  "lib/core/secret.ts isDemoRuntime",
  "lib/core/sync.ts providersDown",
  "lib/core/sync.ts syncAccount",
  "lib/core/utils.ts transliterate",
  "lib/db/tx.ts getTxDb",
  "lib/discord/components.ts addToServerButton",
  "lib/discord/components.ts backId",
  "lib/discord/components.ts select",
  "lib/discord/config.ts botApiSecret",
  "lib/discord/config.ts canAct",
  "lib/discord/config.ts canVerify",
  "lib/discord/identify.ts recordSeenRoles",
  "lib/discord/rest.ts createChannel",
  "lib/discord/rest.ts listChannels",
  "lib/discord/screens/card.ts cardText",
  "lib/identity/countries.ts allCountries",
  "lib/identity/credentials.ts discordLinkOutcome",
  "lib/money/payouts.ts payoutTotal",
  "lib/money/stripe.ts alreadyHandled",
  "lib/money/stripe.ts stripeConfigured",
  "lib/pool/record.ts currentRows",
  "lib/pool/record.ts superseded",
  "lib/pool/score.ts dividePool",
  "lib/pool/score.ts kpisForWeek",
  "lib/portal/brand-auth.ts brandUsersFor",
  "lib/portal/session.ts mayOpenPortal",
  "lib/profile/theme.ts cursorValue",
  "lib/providers/adapters.ts explainErrorBody",
  "lib/providers/adapters.ts scrubSecrets",
  "lib/providers/registry.ts isScoreable",
  "lib/providers/riot-lol-rich.ts champIconUrl",
  "lib/providers/riot-lol-rich.ts champSplashUrl",
  "lib/providers/riot-lol-rich.ts getLolMatchDetail",
  "lib/providers/riot-lol-rich.ts profileIconUrl",
  "lib/providers/riot-verify.ts assertApprovedRiotPath",
  "lib/providers/riot-verify.ts currentIconId",
  "lib/site/queries.ts challengeById",
  "lib/trophies/milestones.ts challengesPerGame",
  "lib/trophies/milestones.ts consecutiveWeeks",
  "lib/trophies/redemption.ts assertAccounted",
];

// ===== THE ONLY FILES THAT COUNT AS A CALLER =====
//
// `app/` and `lib/`, plus `instrumentation.ts` — Next calls `register()` on
// every runtime boot, which is a more reliable caller than a page somebody has
// to visit. Not `tests/`, not `scripts/`, not `ported/`.
const IGNORE_DIRS = new Set(["node_modules", "screenshots", ".next", "drizzle"]);

type Exported = { name: string; isFunction: boolean; line: number; returns: string };
type Binding = { from: string; imported: string; local: string; namespace: boolean };
type FileInfo = {
  abs: string;
  rel: string;
  sf: ts.SourceFile;
  exports: Exported[];
  /** `export { a } from "./x"` and `export { a }` — the chain L12 has to follow. */
  reExports: { from: string; imported: string; exported: string }[];
  /** `export * from "./x"`. */
  starExports: string[];
  imports: Binding[];
  /** Every identifier and property name used OUTSIDE an import/export clause. */
  mentions: Set<string>;
};

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** A relative specifier, with or without its extension, or a folder index. */
function resolveSpec(fromAbs: string, spec: string, all: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromAbs), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (all.has(c)) return c;
  }
  return null;
}

function readFile(abs: string, src: string): FileInfo {
  const sf = ts.createSourceFile(
    abs,
    src,
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const info: FileInfo = {
    abs,
    rel: path.relative(repoRoot, abs),
    sf,
    exports: [],
    reExports: [],
    starExports: [],
    imports: [],
    mentions: new Set(),
  };
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const from = st.moduleSpecifier.text;
      const clause = st.importClause;
      const named = clause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          info.imports.push({
            from,
            imported: (el.propertyName ?? el.name).text,
            local: el.name.text,
            namespace: false,
          });
        }
      }
      if (named && ts.isNamespaceImport(named)) {
        info.imports.push({ from, imported: "*", local: named.name.text, namespace: true });
      }
      if (clause?.name) {
        info.imports.push({ from, imported: "default", local: clause.name.text, namespace: false });
      }
      continue;
    }

    if (ts.isExportDeclaration(st)) {
      const from =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : "";
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          info.reExports.push({
            from,
            imported: (el.propertyName ?? el.name).text,
            exported: el.name.text,
          });
        }
      } else if (from) {
        info.starExports.push(from);
      }
      continue;
    }

    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;

    if (ts.isFunctionDeclaration(st) && st.name) {
      info.exports.push({
        name: st.name.text,
        isFunction: true,
        line: lineOf(st),
        returns: st.type?.getText(sf) ?? "",
      });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const isFn = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        info.exports.push({
          name: d.name.text,
          isFunction: isFn,
          line: lineOf(d),
          returns: isFn ? ((init as ts.ArrowFunction).type?.getText(sf) ?? "") : "",
        });
      }
    }
  }

  // Import and export clauses are skipped: naming a symbol in order to import
  // it is not using it. `94-surface-reach` learned the same lesson about
  // side-effect imports from the other direction.
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isIdentifier(n)) info.mentions.add(n.text);
    if (ts.isPropertyAccessExpression(n)) info.mentions.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  return info;
}

type Graph = {
  infos: Map<string, FileInfo>;
  /** `declaringFile#exportName` → the files that import and mention it. */
  callers: Map<string, Set<string>>;
  /** The same key → each importing file and the local name it bound. */
  bindings: Map<string, { file: string; local: string }[]>;
};

async function buildGraph(): Promise<Graph> {
  const files = [
    ...(await walk(path.join(repoRoot, "app"))),
    ...(await walk(path.join(repoRoot, "lib"))),
  ];
  const instrumentation = path.join(repoRoot, "instrumentation.ts");
  if (await fs.stat(instrumentation).then(() => true, () => false)) files.push(instrumentation);

  const all = new Set(files);
  const infos = new Map<string, FileInfo>();
  for (const abs of files) infos.set(abs, readFile(abs, await fs.readFile(abs, "utf8")));

  /** Follow `export {x} from` and `export * from` back to the declaration. */
  const origin = (
    abs: string,
    name: string,
    seen = new Set<string>(),
  ): { abs: string; name: string } | null => {
    const key = `${abs}#${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const info = infos.get(abs);
    if (!info) return null;
    if (info.exports.some((e) => e.name === name)) return { abs, name };
    for (const r of info.reExports) {
      if (r.exported !== name) continue;
      if (!r.from) return { abs, name };
      const t = resolveSpec(abs, r.from, all);
      const o = t ? origin(t, r.imported, seen) : null;
      if (o) return o;
    }
    for (const s of info.starExports) {
      const t = resolveSpec(abs, s, all);
      const o = t ? origin(t, name, seen) : null;
      if (o) return o;
    }
    return null;
  };

  const callers = new Map<string, Set<string>>();
  const bindings = new Map<string, { file: string; local: string }[]>();
  const mark = (key: string, file: string, local: string): void => {
    callers.set(key, (callers.get(key) ?? new Set()).add(file));
    bindings.set(key, [...(bindings.get(key) ?? []), { file, local }]);
  };

  for (const info of infos.values()) {
    for (const imp of info.imports) {
      const target = resolveSpec(info.abs, imp.from, all);
      if (!target || !info.mentions.has(imp.local)) continue;
      if (imp.namespace) {
        // `import * as rest from "./rest.ts"` then `rest.dmUser(…)`. The
        // property name is in `mentions`, so the export is reached by name.
        for (const e of infos.get(target)!.exports) {
          if (info.mentions.has(e.name)) mark(`${target}#${e.name}`, info.rel, e.name);
        }
        continue;
      }
      const o = origin(target, imp.imported);
      if (!o || o.abs === info.abs) continue;
      mark(`${o.abs}#${o.name}`, info.rel, imp.local);
    }

    // `const { closeWeek } = await import("../pool/score.ts")`. Missing these
    // would call `closeWeek` dead while it runs every Friday — the same hole
    // `94-surface-reach` names in its own import reader.
    for (const m of info.sf.text.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const target = resolveSpec(info.abs, m[1], all);
      if (!target || target === info.abs) continue;
      for (const e of infos.get(target)!.exports) {
        if (info.mentions.has(e.name)) mark(`${target}#${e.name}`, info.rel, e.name);
      }
    }
  }

  return { infos, callers, bindings };
}

/** Every exported function declared under `lib/`. */
function libFunctions(g: Graph): { info: FileInfo; e: Exported }[] {
  const out: { info: FileInfo; e: Exported }[] = [];
  for (const info of g.infos.values()) {
    if (!info.rel.startsWith("lib/")) continue;
    for (const e of info.exports) if (e.isFunction) out.push({ info, e });
  }
  return out;
}

/**
 * The identity of an orphan is `file name`, and deliberately **not** its line.
 *
 * The allowance below is compared against this list, so whatever this returns
 * is what an entry has to match. A line number is not an identity: adding a
 * comment above `dividePool` moves it, the entry stops matching, and the band
 * goes red for a reason that has nothing to do with the rule — which is how a
 * guard gets an exemption widened to shut it up.
 */
function uncalled(g: Graph): string[] {
  return libFunctions(g)
    .filter(({ info, e }) => !g.callers.has(`${info.abs}#${e.name}`))
    .map(({ info, e }) => `${info.rel} ${e.name}`)
    .sort();
}

test("the export graph is built, and it can tell a called function from an uncalled one", async () => {
  // ===== THE CANARY, BEFORE THE GUARD IS TRUSTED =====
  //
  // `02-structural`'s first case and `94-surface-reach`'s are here for the
  // same reason: an analysis that silently read nothing would make every
  // assertion below pass over an empty list, and the defect would be
  // invisible in the shape of a green tick.
  const g = await buildGraph();

  ok(g.infos.size > 100, `the walk parsed ${g.infos.size} source files`);
  const fns = libFunctions(g);
  ok(fns.length > 200, `and found ${fns.length} exported functions under lib/`);

  // Reached, and reached specifically — not "some things are reached".
  const scorer = fns.find((f) => f.info.rel === "lib/pool/score.ts" && f.e.name === "closeWeek");
  ok(scorer !== undefined, "the pool's weekly close is among them");
  ok(
    g.callers.has(`${scorer!.info.abs}#closeWeek`),
    "and it has a caller — an all-uncalled answer would prove nothing about the graph",
  );

  // And the dynamic-import edge specifically, because `closeWeek` is only ever
  // reached through one. A graph that missed it would still pass the line
  // above via some other module, and would be wrong about this one.
  ok(
    [...g.callers.get(`${scorer!.info.abs}#closeWeek`)!].includes("lib/challenges/jobs.ts"),
    "reached from the weekly tick, which imports it dynamically",
  );
});

test("every exported function in lib/ is called from outside its own module", async () => {
  // L12. The unit is the **symbol**, not the file — that distinction is the
  // whole suite. `rest.ts` is imported by half the app and `dmUser` inside it
  // is called by nothing.
  const g = await buildGraph();
  const orphans = uncalled(g);

  eq(
    orphans,
    [...NOT_YET_CALLED].sort(),
    "an exported function with no caller outside its own module is an unfinished " +
      "feature, dead code, or an export that should never have been one. A test " +
      "is not a caller",
  );
});

test("an entry excused from needing a caller still describes something real", async () => {
  // L13, and 09's fifth rule: *an allowance that outlives what it excused is
  // how a deleted rule comes back.* Two ways an entry stops being real, and
  // both fail here rather than sitting quietly.
  const g = await buildGraph();
  const declared = new Set(libFunctions(g).map(({ info, e }) => `${info.rel} ${e.name}`));
  const stillUncalled = new Set(uncalled(g));

  for (const excused of NOT_YET_CALLED) {
    ok(
      declared.has(excused),
      `${excused} is excused from needing a caller and no longer exists — remove ` +
        "the entry, because an allowance with no subject excuses the next thing that takes its name",
    );
    ok(
      stillUncalled.has(excused),
      `${excused} has a caller now — delete its line from NOT_YET_CALLED, because ` +
        "an allowance that outlived its reason is a hole with a name",
    );
  }
  // ===== AND THE TWO FAILURE MODES ARE DEMONSTRABLY DETECTABLE =====
  //
  // With the list empty the loop above runs zero times, so on its own it is a
  // test that cannot fail — trap 27 exactly. Both conditions it checks are
  // therefore exercised against the real graph on a subject chosen because the
  // answer is known: `closeWeek` is declared, and it is called.
  const closeWeek = [...declared].find((d) => d.endsWith(" closeWeek"));
  ok(closeWeek !== undefined, "the graph declares lib/pool/score.ts closeWeek");
  ok(
    !stillUncalled.has(closeWeek!),
    "and it is called — so excusing it would be caught as an allowance whose reason is spent",
  );
  ok(
    !declared.has("lib/nothing/here.ts neverWritten"),
    "and an entry with no subject is caught, because the graph does not declare one",
  );
});

// ===== L14 — THE DEFECT WEARING A CALLER =====
//
// `beginEmailVerification` passes every test above. It is exported, it is
// imported by two route files, and both of them call it. What neither does is
// **use the answer anywhere production can see**:
//
//     const code = await beginEmailVerification(db, userId, email);
//     return back(request, "/signup/verify", isDemoMode ? { code } : {});
//
// The code is minted, hashed into a row, handed back — and in production its
// only reader is a branch that does not run. A value whose every use sits
// behind a demo fence does not exist in production, and the page still says
// "sent".
//
// That is the discriminating property, and it is why this half is written as
// "used only behind a demo fence" rather than the broader "dropped at every
// call site". Both are L14. The broad reading also flags eighteen functions
// that perform a write and return a convenience id nobody needs — `sweep`,
// `announce`, `allocateToPool` — which are not defects, and an allowance list
// of eighteen benign entries is a hole with a name. The narrow reading has no
// false positives on this branch and catches every real one.

/** What a demo fence looks like on this platform. Both spellings are in use. */
const DEMO_FENCE = /isDemoMode|process\.env\.DATABASE_URL/;

function unwrap(call: ts.Node): ts.Node {
  let n = call;
  while (
    n.parent &&
    (ts.isAwaitExpression(n.parent) ||
      ts.isParenthesizedExpression(n.parent) ||
      ts.isAsExpression(n.parent) ||
      ts.isNonNullExpression(n.parent))
  ) {
    n = n.parent;
  }
  return n;
}

/** Is every path from here to the enclosing function through a demo test? */
function behindDemoFence(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isConditionalExpression(cur) && DEMO_FENCE.test(cur.condition.getText())) return true;
    if (ts.isIfStatement(cur) && DEMO_FENCE.test(cur.expression.getText())) return true;
    if (
      ts.isBinaryExpression(cur) &&
      (cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        cur.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
      DEMO_FENCE.test(cur.left.getText())
    ) {
      return true;
    }
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      return false;
    }
    cur = cur.parent;
  }
  return false;
}

type Verdict = "consumed" | "dropped" | "demo-only";

function verdictFor(call: ts.CallExpression, info: FileInfo): Verdict {
  const parent = unwrap(call).parent;
  if (!parent || ts.isExpressionStatement(parent)) return "dropped";

  let bound: string | null = null;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) bound = parent.name.text;
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(parent.left)
  ) {
    bound = parent.left.text;
  }
  if (bound === null) return behindDemoFence(call) ? "demo-only" : "consumed";

  // ===== SCOPED TO WHERE THE BINDING WAS DECLARED =====
  //
  // A same-named local in a sibling block is a different variable, and
  // counting it reads as a use. `app/api/auth/gamer/route.ts` holds three
  // separate `code`s in one `POST`, and a file-wide search over that name
  // reported the verification code as consumed — by the confirm branch, which
  // is a different value entirely. Found by running it against the known defect
  // and watching it come back green.
  const name = bound;
  const declaresIt = (n: ts.Node): boolean => {
    let found = false;
    ts.forEachChild(n, (c) => {
      if (!ts.isVariableStatement(c)) return;
      for (const d of c.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) found = true;
      }
    });
    return found;
  };
  let scope: ts.Node = ts.isVariableDeclaration(parent) ? parent : call;
  while (scope.parent) {
    scope = scope.parent;
    if ((ts.isBlock(scope) || ts.isSourceFile(scope)) && declaresIt(scope)) break;
  }

  // Three things that carry the name without reading the value, and each of
  // them read as a use until it was looked at: the declaration itself
  // (`let code: string;` — three lines above the assignment), a property key
  // (`{ code: e.code }`, in the sibling action), and a property name after a
  // dot. Counting any of them made `beginEmailVerification` read as consumed.
  const isBinding = (n: ts.Identifier): boolean => {
    const p = n.parent;
    if (!p) return false;
    if (ts.isVariableDeclaration(p) && p.name === n) return true;
    if (ts.isBindingElement(p) && p.name === n) return true;
    if (ts.isPropertyAssignment(p) && p.name === n) return true;
    if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
    return false;
  };
  const uses: ts.Identifier[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === name && n.parent !== parent && !isBinding(n)) {
      uses.push(n);
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(scope, visit);

  if (uses.length === 0) return "dropped";
  return uses.every((u) => behindDemoFence(u)) ? "demo-only" : "consumed";
}

function callSitesIn(info: FileInfo, local: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const ex = n.expression;
      if (
        (ts.isIdentifier(ex) && ex.text === local) ||
        (ts.isPropertyAccessExpression(ex) && ex.name.text === local)
      ) {
        out.push(n);
      }
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(info.sf, visit);
  return out;
}

/** Every call site of an export, with a verdict on what happens to its answer. */
function returnVerdicts(g: Graph, key: string): Verdict[] {
  const [declAbs, name] = key.split("#");
  const declRel = path.relative(repoRoot, declAbs);
  const sites = g.bindings.get(key) ?? [];
  // The declaring module counts as a call site too: `weeklyTick` consumes
  // `closeChallenges` from inside `jobs.ts`, and ignoring that reads as a
  // defect. Cross-module bindings alone are the wrong denominator.
  const all = sites.some((s) => s.file === declRel)
    ? sites
    : [...sites, { file: declRel, local: name }];

  const dead = new Set(uncalled(g).map((o) => o.split(" ")[1]));
  const verdicts: Verdict[] = [];
  for (const { file, local } of all) {
    const info = [...g.infos.values()].find((i) => i.rel === file);
    if (!info) continue;
    for (const call of callSitesIn(info, local)) {
      // A caller that nothing calls is not a caller. `startEmailVerification`
      // consumes the code and is itself an orphan; counting it made this guard
      // green over the defect it was written for.
      let host: ts.Node | undefined = call;
      let hostIsDead = false;
      while (host) {
        if (host.parent && ts.isSourceFile(host.parent)) {
          const named = ts.isFunctionDeclaration(host)
            ? host.name?.text
            : ts.isVariableStatement(host) && ts.isIdentifier(host.declarationList.declarations[0].name)
              ? host.declarationList.declarations[0].name.text
              : undefined;
          if (named && dead.has(named)) hostIsDead = true;
          break;
        }
        host = host.parent;
      }
      if (!hostIsDead) verdicts.push(verdictFor(call, info));
    }
  }
  return verdicts;
}

test("no value minted in production is used only in demo mode", async () => {
  const g = await buildGraph();
  const offenders: string[] = [];

  for (const key of g.bindings.keys()) {
    const [declAbs, name] = key.split("#");
    const info = g.infos.get(declAbs);
    const decl = info?.exports.find((e) => e.name === name);
    if (!info || !decl) continue;
    const returns = decl.returns.replace(/\s/g, "");
    // A function declared to return nothing is not discarding anything.
    if (!returns || returns === "void" || returns === "Promise<void>") continue;

    const verdicts = returnVerdicts(g, key);
    if (verdicts.length > 0 && verdicts.every((v) => v === "demo-only")) {
      offenders.push(`${info.rel} ${name}`);
    }
  }

  eq(
    offenders.sort(),
    [],
    "a value whose every use in production sits behind a demo fence was never " +
      "delivered. This is how a gamer is told a code was sent that nobody sent",
  );
});

test("the return-value reading can tell the three verdicts apart", async () => {
  // ===== TRAP 27, ANSWERED BEFORE IT IS ASKED =====
  //
  // The assertion above compares a list against an empty one. If `verdictFor`
  // returned "consumed" for everything — a plausible bug, since "consumed" is
  // its fall-through — the list would be empty and the suite would be green
  // over every defect it exists to find. So the reader is exercised directly,
  // on source written here, and all three verdicts must be reachable.
  const src = [
    'import { mint } from "./x.ts";',
    "const isDemoMode = false;",
    "export async function consumes() {",
    "  const value = await mint();",
    "  return value.length;",
    "}",
    "export async function drops() {",
    "  await mint();",
    "}",
    "export async function demoOnly() {",
    "  const value = await mint();",
    "  return isDemoMode ? { value } : {};",
    "}",
  ].join("\n");
  const info = readFile(path.join(repoRoot, "lib", "__reader-check.ts"), src);
  const verdicts = callSitesIn(info, "mint").map((c) => verdictFor(c, info));

  eq(
    verdicts,
    ["consumed", "dropped", "demo-only"],
    "the reader separates a value that is used, one that is thrown away, and " +
      "one whose only reader is a branch production never takes",
  );
});
