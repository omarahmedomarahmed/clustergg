/**
 * WHEN THE BOT BREAKS, IT SAYS WHY — SOMEWHERE AN OPERATOR CAN READ IT.
 *
 * ===== WHAT HAPPENED =====
 *
 * The bot broke in production. A gamer ran `/cluster` twice and got
 *
 *   Something went wrong
 *   Cluster couldn't load that just now.
 *
 * and that was the entire evidence trail. Vercel's runtime errors: none.
 * `discord_command_logs`: the command, no failure. The only artefact was a
 * screenshot.
 *
 * The cause was four `catch` blocks in the interactions route that did not
 * merely swallow the error — they did not BIND it. `} catch {`. The reason was
 * destroyed at the point of failure, so it could not be recovered afterwards
 * by any amount of looking.
 *
 * This is the same disease `lib/providers/adapters.ts` had, where Riot's
 * `HTTP 400` was recorded with the response body thrown away, and it cost a
 * day of guessing between hypotheses that one captured sentence settled
 * immediately ("Exception decrypting"). Two subsystems, one habit: catch the
 * failure, show something friendly, discard the only useful part.
 *
 * ===== WHAT THIS ASSERTS =====
 *
 * Not the wording of the friendly message — that is for the gamer and can
 * change. What is asserted is that no path shows it while throwing the reason
 * away, that the reason is scrubbed before it is logged (a thrown error can
 * carry a URL with a token in it), and that the gamer still gets a sentence
 * rather than a stack trace.
 *
 *   DEMO_DB=1 npx tsx tests/db/bot-errors.mts
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

const ROUTE = "app/api/discord/interactions/route.ts";
const raw = readFileSync(new URL(`../../${ROUTE}`, import.meta.url), "utf8");
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

console.log("== every friendly failure carries a reason ==");
{
  // The sentence the gamer sees. However it is worded, it must never appear in
  // a catch that discarded the error.
  const friendly = [...src.matchAll(/couldn't load that just now/g)];
  ok("the friendly message is still used", friendly.length > 0, String(friendly.length));

  // THE DEFECT, stated exactly: a catch with no binding, followed by the
  // friendly message. `} catch {` cannot log anything — there is nothing to log.
  const blind = [...src.matchAll(/\}\s*catch\s*\{[^}]*couldn't load that just now/g)];
  eq("no blind catch shows it", blind.length, 0);

  // …and every one of them reports before it replies. Order matters: reporting
  // after `editWithError` means a failure inside THAT call loses the original.
  const handlers = [...src.matchAll(/\}\s*catch\s*\(\w+\)\s*\{([\s\S]{0,400}?)couldn't load that just now/g)];
  eq("every friendly failure is preceded by a report", handlers.length, friendly.length);
  ok("…and each reports first", handlers.every((m) => /botFailed\(/.test(m[1])),
    handlers.map((m) => m[1].trim().slice(0, 50)).join(" | "));
}

console.log("== the reason is safe to write down ==");
{
  const fn = src.slice(src.indexOf("function botFailed"), src.indexOf("function botFailed") + 700);
  ok("the reporter exists", fn.length > 50);
  ok("…and scrubs before logging", /scrubSecrets\(/.test(fn),
    "a thrown error can carry a URL with a token in it");
  ok("…keeps the stack, not just the message", /\.stack/.test(fn),
    "a message alone rarely says which line");
  ok("…and is bounded", /slice\(0, ?\d+\)/.test(fn), "an unbounded stack in a log line helps nobody");
  ok("…and never throws on its own", /catch \{ why = /.test(fn),
    "a reporter that can throw turns one failure into two");

  // It must reach somewhere an operator actually looks. `console.error` is what
  // Vercel's runtime errors read.
  ok("it reports to the platform log", /console\.error\(/.test(fn));
}

console.log("== the gamer still gets a sentence, not a stack ==");
{
  // The whole point of the friendly message. Reporting must not change what is
  // sent back into Discord.
  const sends = [...src.matchAll(/editWithError\(i\.token, ([^)]*)\)/g)];
  ok("the reply is still the friendly string", sends.length > 0);
  ok("…and no stack or error object is sent to Discord",
    !sends.some((m) => /\be\b|\.stack|String\(e\)/.test(m[1])),
    sends.map((m) => m[1].slice(0, 40)).join(" | "));
}

console.log("== and the provider layer has not regressed to the same habit ==");
{
  // Same lesson, other subsystem — asserted together so neither drifts back.
  const ad = readFileSync(new URL("../../lib/providers/adapters.ts", import.meta.url), "utf8");
  ok("provider errors still capture the response body", /explainErrorBody\(await res\.text\(\)\)/.test(ad),
    "the Riot 400 that cost a day of guessing");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
