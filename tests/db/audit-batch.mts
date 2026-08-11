/**
 * Seven findings from the audit, each with the assertion that would have caught it.
 *
 *   B2  every `gamer:` autocomplete suggestion was a dead end
 *   B6  the portal-key action had no permission check
 *   F6  a signed interaction replayed forever
 *   F1  the hourly sync reported success at 88% failure
 *   G2  the first-run onboarding code was unreachable
 *   G3  a live verification code could be printed into production HTML
 *   G4  internal screenshot placeholders on a customer's wallet page
 *
 *   DEMO_DB=1 npx tsx tests/db/audit-batch.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${String(got)}, want ${String(want)}`);
const at = (p: string) => new URL(`../../${p}`, import.meta.url);
const code = (p: string) => readFileSync(at(p), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

console.log("== B2: a gamer the bot suggested can be opened ==");
{
  // The whole defect in one line: `frame("gamer", name)` put the NAME in the
  // GAME slot, and `frame()` drops empty args so it could not simply be padded.
  const { screenForCommand } = await import("../../lib/discord/screens.ts");
  const { frame } = await import("../../lib/discord/components.ts");

  const f = await screenForCommand("gamer:auditgamer");
  eq("the route is the gamer screen", f.screen, "gamer");
  eq("…and the NAME lands in the name slot, not the game slot", f.args[1], "auditgamer");
  ok("…with an explicit marker in the game slot", !!f.args[0] && f.args[0] !== "auditgamer", JSON.stringify(f.args));

  // The trap that made the first fix fail: an empty string is dropped.
  eq("frame() drops an empty arg, which is why the marker exists",
    frame("gamer", "", "auditgamer").args.length, 1);

  // And the marker survives a round trip through a button's custom_id.
  const { navId, parseId } = await import("../../lib/discord/components.ts");
  const parsed = parseId(navId(f, []));
  eq("the marker survives being packed into a custom_id", parsed?.target.args[1], "auditgamer");
}

console.log("== B6: the portal key is manager-only ==");
{
  const src = code("app/api/discord/interactions/route.ts");
  const block = src.slice(src.indexOf('target.screen === "portal-key"'));
  const guard = block.slice(0, block.indexOf("ensurePortal"));
  ok("the handler checks authority before minting or sending", /maySetup\(/.test(guard), guard.slice(0, 200));
  ok("…and refuses with a reason", /Only this server's admins/.test(block.slice(0, 900)));
}

console.log("== F6: a captured interaction does not replay forever ==");
{
  const { verifyInteraction, MAX_SIGNATURE_AGE_SECONDS } = await import("../../lib/discord/verify.ts");
  const prev = process.env.DISCORD_PUBLIC_KEY;
  process.env.DISCORD_PUBLIC_KEY = "f84a6ed77dcc96402152b08abc21cd584357c62714c5d7412815497506cf0144";

  const stale = String(Math.floor(Date.now() / 1000) - (MAX_SIGNATURE_AGE_SECONDS + 60));
  const r = verifyInteraction("{}", "00".repeat(64), stale);
  ok("a timestamp older than the window is rejected", !r.ok && r.reason === "stale_timestamp", JSON.stringify(r));

  // …and rejected BEFORE the signature check, so a replay never costs a verify.
  const future = String(Math.floor(Date.now() / 1000) + (MAX_SIGNATURE_AGE_SECONDS + 60));
  const f = verifyInteraction("{}", "00".repeat(64), future);
  ok("…and so is one from too far in the future", !f.ok && f.reason === "stale_timestamp", JSON.stringify(f));

  // A fresh one gets as far as the cryptography (and fails there, on a bogus
  // signature) — which is what proves the window is not rejecting everything.
  const fresh = verifyInteraction("{}", "00".repeat(64), String(Math.floor(Date.now() / 1000)));
  ok("a fresh one reaches the signature check", !fresh.ok && fresh.reason === "invalid_signature", JSON.stringify(fresh));

  if (prev === undefined) delete process.env.DISCORD_PUBLIC_KEY; else process.env.DISCORD_PUBLIC_KEY = prev;
}

console.log("== F1: the sync reports per provider, and a dead provider fails the run ==");
{
  const { providersDown } = await import("../../lib/sync.ts");

  // THE SIGNAL. Not a count — the shape.
  const scattered = [
    { provider: "chesscom", synced: 40, failed: 2, down: false },
    { provider: "steam", synced: 18, failed: 1, down: false },
  ];
  eq("3% scattered across healthy providers is not a problem", providersDown(scattered).length, 0);

  const keyExpired = [
    { provider: "chesscom", synced: 40, failed: 2, down: false },
    { provider: "riot-lol", synced: 0, failed: 53, down: true, lastError: "403 forbidden" },
  ];
  eq("one provider failing everything IS", providersDown(keyExpired).length, 1);
  eq("…and it is named", providersDown(keyExpired)[0].provider, "riot-lol");

  // The number of failures must not be what decides it: 53 scattered failures
  // across working providers is still healthy, and 1 is still unhealthy when it
  // is everything that provider had.
  eq("a big scattered failure count is still healthy",
    providersDown([{ provider: "a", synced: 200, failed: 53, down: false }]).length, 0);
  eq("a single total failure is still unhealthy",
    providersDown([{ provider: "b", synced: 0, failed: 1, down: true }]).length, 1);

  const route = code("app/api/cron/sync/route.ts");
  ok("the route answers non-2xx when a provider is down", /status: down\.length \? 500 : 200/.test(route));
  ok("…and ok reflects it", /ok: down\.length === 0/.test(route));
  ok("…with no tunable failure threshold anywhere in it",
    !/failed\s*[><]=?\s*\d/.test(route), "a count threshold is back — it will be tuned until it stops paging");
}

console.log("== G3: a live code is never printable on a real deployment ==");
{
  const { codeShownOnScreen } = await import("../../lib/email-verify.ts");
  const prevDemo = process.env.DEMO_DB, prevUrl = process.env.DATABASE_URL;

  process.env.DEMO_DB = "1"; delete process.env.DATABASE_URL;
  eq("demo + no mail → shown, so a local copy is usable", codeShownOnScreen(false), true);
  eq("demo + mail working → not shown", codeShownOnScreen(true), false);

  // THE HOLE. `emailConfigured()` alone decided this, so one unset or rotated
  // API key in production started rendering every account's live code.
  delete process.env.DEMO_DB; process.env.DATABASE_URL = "postgres://example/real";
  eq("REAL database + no mail → NEVER shown", codeShownOnScreen(false), false);
  eq("real database + mail working → not shown", codeShownOnScreen(true), false);

  if (prevDemo === undefined) delete process.env.DEMO_DB; else process.env.DEMO_DB = prevDemo;
  if (prevUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prevUrl;

  const action = code("app/actions/onboarding.ts");
  ok("the action gates the code on it", /demoCode: codeShownOnScreen\(/.test(action));
  ok("…and no longer on emailConfigured alone",
    !/demoCode: emailConfigured\(\) \?/.test(action));
}

console.log("== G2: and when it cannot be shown, the page says so ==");
{
  const step = code("components/onboarding/EmailStep.tsx");
  ok("a demo with no code yet is told where the code is", /Press[\s\S]{0,60}Send it again/.test(step));
  ok("a real deployment with mail off is told it will never arrive",
    /!codeOnScreen && mailOff/.test(step) && /will not/.test(step));
}

console.log("== G4: an empty screenshot slot is invisible to customers ==");
{
  const shot = code("components/FeatureShot.tsx");
  ok("nothing is rendered for a visitor when the slot is empty",
    /if \(!shot\.imageUrl && !staff\) return null;/.test(shot));
  // The staff placeholder must survive — it is how anybody knows to capture one.
  ok("…and staff still get the loud placeholder", /Screenshot pending/.test(shot));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
