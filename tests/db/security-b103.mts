// Four holes, closed. B103.
//
// Every one of these was a guard that existed and did not cover the case it was
// written for. That is the pattern worth noticing: none of them was missing, all
// of them were slightly wrong, and slightly wrong is invisible right up until
// somebody looks.
//
//   an open redirect      `new URL(dest, base)` honours an absolute URL.
//   an open bootstrap     `if (token && …)` — no token meant no check.
//   an open image proxy   `hostname: "**"`.
//   a lockout that counted per portal, so spraying across portals was free.
//
//   DEMO_DB=1 npx tsx tests/db/security-b103.mts

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

const raw = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => raw(p)
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { safeNext, DEFAULT_NEXT } = await import("../../lib/safe-next.ts");

console.log("== a redirect can only land on this site ==");
{
  eq("an ordinary path is kept", safeNext("/quests"), "/quests");
  eq("…with its query", safeNext("/challenges?game=Chess"), "/challenges?game=Chess");
  eq("nothing falls back", safeNext(""), DEFAULT_NEXT);
  eq("…and so does junk", safeNext(42 as never), DEFAULT_NEXT);

  // THE HOLE. `new URL("https://evil.example", base)` returns the absolute URL
  // and ignores the base entirely — which is what the URL constructor is FOR,
  // and why "it's resolved against our origin" was never true.
  eq("an absolute url is refused", safeNext("https://evil.example/login"), DEFAULT_NEXT);
  eq("…http too", safeNext("http://evil.example"), DEFAULT_NEXT);
  // The bypass every naive startsWith("/") check misses.
  eq("a protocol-relative url is refused", safeNext("//evil.example/x"), DEFAULT_NEXT);
  eq("…including the backslash spelling", safeNext("/\\evil.example"), DEFAULT_NEXT);
  eq("…and the double backslash", safeNext("\\\\evil.example"), DEFAULT_NEXT);
  eq("a javascript url is refused", safeNext("javascript:alert(1)"), DEFAULT_NEXT);
  eq("…even wearing a slash", safeNext("/javascript:alert(1)"), DEFAULT_NEXT);
  // A newline in a redirect target is a response-splitting attempt.
  eq("a header-splitting newline is refused", safeNext("/feed\nSet-Cookie: a=b"), DEFAULT_NEXT);

  // And it is actually WIRED IN, at both ends. The cookie is written at the
  // start of the flow and read at the end; checking only one of them leaves the
  // other as the way in.
  ok("the oauth start sanitises it", /safeNext\(/.test(code("app/api/auth/[provider]/route.ts")));
  ok("…and the callback sanitises it again",
    /flow\.next = safeNext\(/.test(code("app/api/auth/[provider]/callback/route.ts")));
}

console.log("\n== bootstrap is closed unless somebody opened it ==");
{
  const setup = code("app/api/setup/route.ts");
  // It read `if (token && …)`, so a deployment that never set SETUP_TOKEN had
  // no check at all.
  ok("a missing token refuses", /if \(!token\)/.test(setup), setup.slice(0, 400));
  ok("…with a 403, not a 200", /status: 403/.test(setup));
  ok("…and says which variable to set", /SETUP_TOKEN is not set/.test(raw("app/api/setup/route.ts")));
  ok("a wrong token still refuses", /!== token/.test(setup));
  // The old shape must be gone, not merely supplemented.
  ok("the permissive guard is gone", !/if \(token &&/.test(setup));
}

console.log("\n== the image proxy is a list, not the internet ==");
{
  const cfg = code("next.config.ts");
  ok("the wildcard host is gone", !/hostname: "\*\*"/.test(cfg), "next.config.ts still allows every host");
  ok("our own blob store is allowed", /public\.blob\.vercel-storage\.com/.test(cfg));
  ok("…and Discord's cdn", /cdn\.discordapp\.com/.test(cfg));
  ok("…and there is an escape hatch that is not a wildcard",
    /EXTRA_IMAGE_HOSTS/.test(cfg) && !/hostname: "\*\*"/.test(cfg));
  // A host list that is only https is not an accident worth losing.
  ok("nothing is allowed over plain http", !/protocol: "http"/.test(cfg));
}

console.log("\n== a portal lockout counts the person, not just the portal ==");
{
  const { getDb, schema } = await import("../../lib/db/index.ts");
  const { uid } = await import("../../lib/utils.ts");
  const { ipLockState, recordAttempt, MAX_IP_FAILURES } = await import("../../lib/portal-attempts.ts");
  const { MAX_FAILURES } = await import("../../lib/portal-auth.ts");

  const db = await getDb();
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;

  ok("one address is allowed more tries than one portal", MAX_IP_FAILURES > MAX_FAILURES,
    `${MAX_IP_FAILURES} vs ${MAX_FAILURES}`);

  const before = await ipLockState(ip);
  ok("an address nobody has used is not locked", !before.locked);

  // THE HOLE. Four wrong keys each at a stack of different portals never trips
  // a per-portal counter — which made guessing free at exactly the scale an
  // attacker would use.
  for (let i = 0; i < MAX_IP_FAILURES; i++) {
    await recordAttempt("server", `guild-${uid().slice(0, 6)}`, "Sprayed", false, { ip, userAgent: "x" });
  }
  const after = await ipLockState(ip);
  ok("spraying across portals locks the address", after.locked,
    `${after.failures} failures, locked=${after.locked}`);
  ok("…and says how long", after.retryInMs > 0);

  // Somebody else is unaffected. A lock that leaked across addresses would be
  // an outage with extra steps.
  const other = await ipLockState("198.51.100.7");
  ok("a different address is untouched", !other.locked);
  ok("…and no address at all is not a lock", !(await ipLockState(null)).locked);

  // A success must NOT reset it — otherwise an attacker who owns one real
  // portal resets their own spray counter every fifth attempt.
  await recordAttempt("server", "guild-legit", "Legit", true, { ip, userAgent: "x" });
  ok("a success does not clear the spray", (await ipLockState(ip)).locked);

  // And the door reads it.
  const unlock = code("app/api/portal/unlock/route.ts");
  ok("the unlock route checks both locks",
    /ipLockState\(/.test(unlock) && /lockState\(kind, portal\.id\)/.test(unlock));
  // Compared at the CALL sites, not the imports — an import list is
  // alphabetical-ish and says nothing about order of execution.
  ok("…before it looks at the key",
    unlock.indexOf("ipLockState(who.ip)") < unlock.indexOf("verifyPortalKey(kind"));
  // The row keeps a hash, never an address — a lockout must not become a log
  // of who was where.
  ok("the attempt log stores a hash, not an address",
    /hashIp\(/.test(code("lib/portal-attempts.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
