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

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
