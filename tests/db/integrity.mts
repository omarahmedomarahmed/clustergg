// B72 — the Phase-0 defects, asserted so they cannot come back.
//
// Every assertion in this file corresponds to a finding in
// `docs/DUE_DILIGENCE_REPORT.md` that was live in production when the report
// was written. The point is not that the fix exists today — a diff proves that
// once. The point is that the NEXT person to touch these files finds out here
// rather than from a reviewer.
//
// Several assertions read the SOURCE rather than calling the function, and that
// is deliberate: "no field in the brand report is derived from headcount" is a
// statement about the code, not about one return value, and a runtime check
// would pass on a report that happens to have zero servers.
//
//   DEMO_DB=1 npx tsx tests/db/integrity.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** Source with comments removed — an assertion must never pass on prose. */
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

console.log("== AUTH_SECRET has no fallback outside a demo runtime ==");
const { authSecret, isDemoRuntime } = await import("../../lib/secret.ts");
// The exact string that shipped. If it ever appears in a signing path again,
// this is the line that says so.
const OLD = "cluster-demo-secret-set-AUTH_SECRET-in-production";
for (const f of ["lib/auth.ts", "middleware.ts"]) {
  ok(`${f} does not carry the fallback itself`, !code(f).includes(OLD));
  ok(`…and reads the key through lib/secret`, /authSecretKey\(\)/.test(code(f)));
}
{
  const before = process.env.AUTH_SECRET;
  const demo = process.env.DEMO_DB;
  try {
    delete process.env.AUTH_SECRET;
    process.env.DEMO_DB = "1";
    ok("a demo runtime still boots without it", authSecret() === OLD);
    process.env.DEMO_DB = "0";
    let threw = "";
    try { authSecret(); } catch (e) { threw = (e as Error).message; }
    ok("a real runtime THROWS without it", /AUTH_SECRET is not set/.test(threw), threw);
    // A deploy that pasted the placeholder out of this repo is the same hole.
    process.env.AUTH_SECRET = OLD;
    threw = "";
    try { authSecret(); } catch (e) { threw = (e as Error).message; }
    ok("…and throws on the public placeholder", /public placeholder/.test(threw), threw);
    process.env.AUTH_SECRET = "short";
    threw = "";
    try { authSecret(); } catch (e) { threw = (e as Error).message; }
    ok("…and on a key too short to be one", /at least 16/.test(threw), threw);
    process.env.AUTH_SECRET = "a-real-secret-of-sufficient-length";
    eq("a real key is returned unchanged", authSecret(), "a-real-secret-of-sufficient-length");
  } finally {
    if (before === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = before;
    if (demo === undefined) delete process.env.DEMO_DB; else process.env.DEMO_DB = demo;
  }
}
ok("the demo predicate is the only thing that opens the door", isDemoRuntime());

console.log("\n== a self-serve creative does NOT go live on upload ==");
// The finding: `app/actions/brand-portal.ts` wrote status "approved" on upload,
// which contradicted our own documented approval gate. Both upload paths.
{
  const portal = code("app/actions/brand-portal.ts");
  const inserts = [...portal.matchAll(/insert\(schema\.adCreatives\)[\s\S]{0,600}?\}\);/g)].map((m) => m[0]);
  ok("both creative inserts are found", inserts.length === 2, `found ${inserts.length}`);
  for (const [i, block] of inserts.entries()) {
    ok(`upload path ${i + 1} inserts pending_review`, /status:\s*"pending_review"/.test(block));
    ok(`…and never "approved"`, !/status:\s*"approved"/.test(block), block.slice(0, 200));
  }
  // The gate only bites because the serving query refuses anything else. If
  // somebody relaxes THAT, the status above becomes decoration.
  ok("serveAds still requires an approved creative",
    /adCreatives\.status,\s*"approved"/.test(code("lib/ads.ts")));
  // And the brand has to be TOLD, or they conclude the product is broken.
  const panel = code("components/BrandCardCampaign.tsx");
  ok("the portal shows an in-review state", /In review/.test(panel));
  ok("…and no longer claims 'You're live' on upload", !/You're live/.test(panel));
  ok("the read model exposes the creative's own review status",
    /reviewStatus:\s*schema\.adCreatives\.status/.test(code("lib/brands.ts")));
  ok("…and 'live' requires it, not just an active campaign",
    /reviewStatus === "approved"/.test(code("lib/brands.ts")));
}

console.log("\n== no brand-facing number is derived from a server headcount ==");
// Finding #1 of the due-diligence report, and the most serious thing in it: the
// brand report priced a SERVER HEADCOUNT at a benchmark CPM, divided by spend,
// and rendered the result to a paying customer as "Return on spend: 2.4x" —
// beside a heading that said "Counted delivery".
//
// The assertions read SOURCE rather than a return value on purpose: "no field
// is derived from a headcount" is a claim about the code. A runtime check would
// pass happily on a report that happens to have zero servers.
{
  const report = code("lib/brand-report.ts");
  ok("mediaValue is gone from the model", !/function mediaValue/.test(report));
  ok("…and so is roasOf", !/function roasOf/.test(report));
  ok("…and the report no longer carries a benchmark it priced things at",
    !/benchmark:\s*\{\s*cpm/.test(report));

  // The root of the finding, one level below it: `members` is the headcount of
  // the servers we posted into. Priced, it became ROAS. Unpriced but labelled
  // "People reached", it is the same false claim in words instead of arithmetic.
  // Three surfaces, not two. The tier strip carried the same label off the same
  // headcount and was found only by grepping the whole tree for the words — the
  // type system could not help, because the number was correct and the NAME was
  // the lie.
  for (const f of ["components/BrandCampaignReports.tsx", "app/api/brands/report/route.ts",
                   "components/BrandTierStrip.tsx"]) {
    ok(`${f} does not say "People reached"`, !/People reached/.test(code(f)));
    ok(`…nor "Return on spend"`, !/Return on spend/.test(code(f)));
    ok(`…nor "Media value"`, !/Media value/i.test(code(f)));
  }
  const panel = code("components/BrandCampaignReports.tsx");
  ok("the headcount is named for what it is", /Members in those servers/.test(panel));
  ok("…and cost-per-1,000 says what it divides BY", /Cost \/ 1,000 members/.test(panel));
  // The positive half. Stripping the lie must not leave the report empty: the
  // number that replaces it has to be one both sides of which are counted.
  ok("the hero figure is cost per entrant, counted on both sides",
    /Cost per entrant/.test(panel) && /counted/.test(panel));
}

console.log("\n== the money paths cannot be broken by a runtime downgrade ==");
// Round-2 finding, and it was a defect the FIX introduced: the pooled driver
// needs a WebSocket, Node 20 has none, and every money path would have thrown —
// loudly on a purchase, and into the logs only on a CP award, which is a silent
// stop to all earning. One project-settings click away.
{
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  ok("package.json pins a Node that has a global WebSocket",
    /(>=|\^)?2[2-9]/.test(String(pkg.engines?.node ?? "")), JSON.stringify(pkg.engines));
  ok("…and .nvmrc agrees", /^2[2-9]/.test(src(".nvmrc").trim()), src(".nvmrc").trim());
  // Belt and braces: the pin states intent, the polyfill survives someone
  // overriding it.
  ok("…and the driver polyfills rather than throwing if it is overridden",
    /webSocketConstructor/.test(code("lib/db/tx.ts")));
  ok("ws is a real dependency, not an optional import that resolves to nothing",
    typeof pkg.dependencies?.ws === "string", JSON.stringify(pkg.dependencies?.ws));
  // The finding under the finding: the suite could not exercise the lock at all.
  ok("an ordinary Postgres is a supported driver, so the lock can be tested",
    /node-postgres/.test(code("lib/db/index.ts")) && /node-postgres/.test(code("lib/db/tx.ts")));
  ok("…and CI runs the concurrency suite against one",
    /DATABASE_URL: postgresql/.test(src(".github/workflows/ci.yml")));
}

console.log("\n== the database driver stays out of the browser bundle ==");
// Caught by a BUILD, not by tsc, and it is §0's oldest trap: Next traces the
// module graph across the client boundary even for a dynamic `await import()`.
// Adding node-postgres put `fs`, `net` and `dns` on a path to the browser —
// `components/CpCalculator.tsx` → `lib/cp-economics.ts` → `lib/marketplace.ts`
// → `lib/db/tx.ts` → `pg` — and the whole chain existed for ONE constant.
{
  const econ = code("lib/cp-economics.ts");
  ok("cp-economics does not reach the marketplace", !/from "@\/lib\/marketplace"/.test(econ), econ.match(/from "@\/lib\/[a-z-]+"/g)?.join(",") ?? "");
  ok("…it takes the rate from the pure module", /from "@\/lib\/cp-rate"/.test(econ));
  const rate = code("lib/cp-rate.ts");
  ok("…and that module imports NOTHING", !/^\s*import\s/m.test(rate), rate.match(/^\s*import.*/m)?.[0] ?? "");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
