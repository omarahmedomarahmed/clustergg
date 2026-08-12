/**
 * A NAME THAT IS NOT LATIN IS STILL A NAME. S1/S2.
 *
 * ===== THE DEFECT =====
 *
 * `slugify` stripped everything outside `a-z0-9` and then returned the literal
 * string `"gamer"` when nothing was left. Observed live in the bot:
 *
 *   日本語ゲーマー  → /u/gamer
 *   لاعب عربي      → /u/gamer-mp7d
 *   a server we had no name for → /servers/gamer
 *
 * Every Discord user or server named in Arabic, Japanese, Korean, Chinese,
 * Cyrillic, Greek, Hebrew or Thai collapsed to the same word, and whoever
 * arrived first took the bare slug permanently. For a Discord gaming audience
 * that is a large fraction of people, not an edge case.
 *
 * The fallback was also wrong wherever the thing was not a gamer.
 * `ensurePortal` read ``slugify(name) || `server-${id}` `` — which looks like a
 * per-domain default and was DEAD CODE, because slugify never returned empty.
 * A server got "gamer".
 *
 * ===== WHAT IS ASSERTED =====
 *
 * That a readable name comes back where one can be produced (the point of
 * transliterating rather than falling back), that nothing collapses to a shared
 * word, and that every caller supplies a fallback describing what the thing IS.
 *
 *   DEMO_DB=1 npx tsx tests/db/slugs.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${String(got)}, want ${String(want)}`);
const at = (p: string) => new URL(`../../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");
const walk = (dir: string): string[] => readdirSync(at(dir), { withFileTypes: true })
  .flatMap((e) => e.name.startsWith(".") || e.name === "node_modules"
    ? [] : e.isDirectory() ? walk(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);

const { slugify, slugifyOr } = await import("../../lib/utils.ts");

console.log("== a name that CAN be transliterated keeps its identity ==");
{
  // The whole reason for transliterating rather than falling back: a person
  // should be able to read their own handle back out of the URL.
  const cases: [string, string][] = [
    ["Привет Мир", "privet-mir"],
    ["Блиц Клуб", "blits-klub"],
    ["Καλημέρα", "kalimera"],
    ["Café Niño", "cafe-nino"],
    ["Chess Legion", "chess-legion"],
    ["NovaStrike#EUW", "novastrike-euw"],
  ];
  for (const [input, want] of cases) eq(`${input} → ${want}`, slugify(input), want);

  // Arabic and Hebrew produce something readable rather than exact — the
  // requirement is a recognisable URL, not a transliteration standard.
  ok("Arabic produces letters, not nothing", /^[a-z0-9-]{3,}$/.test(slugify("لاعب عربي")), slugify("لاعب عربي"));
  ok("Hebrew produces letters, not nothing", /^[a-z0-9-]{3,}$/.test(slugify("שלום")), slugify("שלום"));
}

console.log("== and one that cannot says so, instead of inventing a word ==");
{
  // These have no useful Latin transliteration here. Empty is the honest
  // answer, and it is what lets each caller pick a fallback that says what the
  // thing IS.
  for (const n of ["日本語ゲーマー", "한국어", "สวัสดี", "🎮🎮", "   ", "!!!"]) {
    eq(`${JSON.stringify(n)} yields nothing`, slugify(n), "");
  }

  // THE DEFECT ITSELF: none of them may collapse to a shared word.
  const collapsed = ["日本語ゲーマー", "한국어", "สวัสดี", "🎮🎮"].map((n) => slugify(n));
  ok("…and none of them is the word 'gamer'", !collapsed.includes("gamer"), collapsed.join(","));
}

console.log("== the fallback names what the thing is ==");
{
  eq("a server gets a server slug", slugifyOr("日本語サーバー", "server-4f2a"), "server-4f2a");
  eq("a gamer gets a gamer slug", slugifyOr("🎮", "gamer-ab12"), "gamer-ab12");
  eq("…and a usable name is never replaced by one", slugifyOr("Nova", "gamer-ab12"), "nova");

  // The old shape, asserted GONE: nothing may hand back a bare "gamer" for a
  // name it could not read.
  const utils = read("lib/utils.ts");
  const fn = utils.slice(utils.indexOf("export function slugify("), utils.indexOf("export function slugifyOr("));
  ok("slugify itself has no default word", !/return .*\|\| "gamer"/.test(fn), fn.slice(0, 200));
}

console.log("== every caller supplies one ==");
{
  // The behaviour change is that slugify can now return "". A call site that
  // writes the result straight into a slug column without a fallback would
  // produce an EMPTY slug, which is worse than the bug being fixed. Swept
  // across the whole tree rather than a remembered list.
  const offenders: string[] = [];
  for (const file of [...walk("lib"), ...walk("app"), ...walk("components")]) {
    if (file === "lib/utils.ts") continue;
    const src = read(file);
    for (const m of src.matchAll(/slug:\s*slugify\(/g)) {
      offenders.push(`${file}: ${src.slice(m.index, (m.index ?? 0) + 60).split("\n")[0]}`);
    }
  }
  ok("no slug column is written straight from slugify()", offenders.length === 0, offenders.join(" · "));

  // And the one place a person types their own slug refuses rather than
  // silently renaming them.
  const conn = read("app/actions/connections.ts");
  ok("a chosen profile URL with nothing usable in it is refused out loud",
    /if \(!slug\) return \{ error:/.test(conn));

  // The dead per-domain fallback that could never fire is now live.
  const portal = read("lib/server-portal.ts");
  ok("the server portal falls back to a SERVER slug", /slugifyOr\(row\.name \|\| "", `server-/.test(portal));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
