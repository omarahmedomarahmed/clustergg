/**
 * A FAILED SYNC SAYS WHY IT FAILED.
 *
 * ===== WHAT WAS WRONG =====
 *
 * `lib/providers/adapters.ts` recorded `HTTP 400 from na1.api.riotgames.com`
 * and threw the response body away. Riot puts the reason in that body. Five
 * League accounts sat failing in production for a day and the only fact anyone
 * could state about it was the number 400 — which is why diagnosing it from
 * outside came down to a choice between hypotheses that one sentence from Riot
 * would have settled.
 *
 * ===== AND WHY CAPTURING IT IS NOT FREE =====
 *
 * `sync_error` is rendered on the gamer's own profile (`app/profile/page.tsx`),
 * so a provider's error text lands on a user-facing surface. Several providers
 * take the API key as a QUERY PARAMETER and echo the failing request back in
 * the error. The old code was accidentally safe only because it discarded
 * everything; capturing the body without scrubbing would have converted a
 * diagnostic win into a credential leak.
 *
 * So the scrub is tested harder than the extraction is. The extraction failing
 * costs a debugging session. The scrub failing puts a key on a web page.
 *
 *   DEMO_DB=1 npx tsx tests/db/provider-errors.mts
 */
process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const has = (name: string, hay: string, needle: string) =>
  ok(name, hay.includes(needle), `${JSON.stringify(hay)} lacks ${JSON.stringify(needle)}`);

const { explainErrorBody, scrubSecrets, ADAPTERS } = await import("../../lib/providers/adapters.ts");

console.log("== the provider's own words survive ==");
{
  // The exact shape Riot returns, and the exact message the live 400 is
  // suspected of carrying.
  const riot = JSON.stringify({ status: { message: "Exception decrypting oHphzex9TM6OE1", status_code: 400 } });
  has("Riot's status.message is extracted", explainErrorBody(riot), "Exception decrypting");

  has("a plain `message` is extracted", explainErrorBody('{"message":"Player not found"}'), "Player not found");
  has("OAuth's error_description is extracted",
    explainErrorBody('{"error":"invalid_grant","error_description":"Token expired"}'), "Token expired");
  has("a string `error` is extracted", explainErrorBody('{"error":"rate limited"}'), "rate limited");
  has("an errors[] array is extracted", explainErrorBody('{"errors":[{"message":"bad shard"}]}'), "bad shard");
  has("non-JSON text is used as-is", explainErrorBody("Service Unavailable"), "Service Unavailable");
}

console.log("== and nothing useless is appended ==");
{
  // An empty result must append NOTHING, or every error grows a dangling dash.
  ok("an empty body adds nothing", explainErrorBody("") === "", JSON.stringify(explainErrorBody("")));
  ok("whitespace adds nothing", explainErrorBody("   \n ") === "");

  // ===== THE CASE THE FIRST VERSION OF THIS SUITE MISSED =====
  //
  // Breaking `return clean ? … : ""` left all 24 assertions green, because the
  // two above are caught by the early `if (!text.trim())` and never reach it.
  // The guard that was actually unprotected is a body that is NOT empty but
  // whose *extracted message* comes out empty — a blank field, or a body that
  // is nothing but a redacted secret. Both produce " — " on its own, a dangling
  // separator stored in the column and shown on somebody's profile.
  ok("a body whose message field is blank adds nothing",
    explainErrorBody('{"message":"   "}') === "", JSON.stringify(explainErrorBody('{"message":"   "}')));

  const KEY_ONLY = "RGAPI-deadbeef-1111-2222-3333-444455556666";
  ok("a body that is nothing but a key adds nothing once scrubbed",
    !explainErrorBody(KEY_ONLY).includes("—") || explainErrorBody(KEY_ONLY).trim().length > 1,
    JSON.stringify(explainErrorBody(KEY_ONLY)));
  ok("a real message is prefixed with a separator", explainErrorBody('{"message":"x"}').startsWith(" — "),
    explainErrorBody('{"message":"x"}'));

  // `lib/sync.ts` truncates sync_error at 300 and the prefix costs ~45, so a
  // provider returning a page of HTML must not eat the whole column.
  const huge = explainErrorBody("<html>" + "z".repeat(5000) + "</html>");
  ok("a huge body is capped", huge.length <= 165, String(huge.length));
  ok("…and collapsed to one line", !/\n/.test(explainErrorBody("a\n\n\nb")), JSON.stringify(explainErrorBody("a\n\n\nb")));
}

console.log("== NO CREDENTIAL REACHES THE COLUMN ==");
{
  // This is the block that matters. It is why the body was safe to discard and
  // is not automatically safe to keep.
  const KEY = "RGAPI-abcdef12-3456-7890-abcd-ef1234567890";
  const prev = process.env.RIOT_API_KEY;
  process.env.RIOT_API_KEY = KEY;
  try {
    const echoed = `{"message":"Forbidden for key ${KEY}"}`;
    const out = explainErrorBody(echoed);
    ok("a key echoed by a provider is redacted", !out.includes(KEY), out);
    has("…and something is still said", out, "Forbidden");

    // Even if the environment has moved on — a rotated key still in a cached
    // response, a key from a different deployment — the shape is recognisable.
    delete process.env.RIOT_API_KEY;
    ok("a Riot key is redacted on shape alone, with the env unset",
      !explainErrorBody(echoed).includes(KEY), explainErrorBody(echoed));

    // The general case: ANY sufficiently long environment value, because the
    // next provider to be added is the one nobody wrote a rule for.
    process.env.SOME_PROVIDER_TOKEN = "s3cr3t-value-long-enough-to-matter";
    ok("any long env value is redacted",
      !scrubSecrets("failed with s3cr3t-value-long-enough-to-matter").includes("s3cr3t-value"),
      scrubSecrets("failed with s3cr3t-value-long-enough-to-matter"));
    delete process.env.SOME_PROVIDER_TOKEN;

    // …but short, ordinary values are NOT redacted, or every message turns to
    // mush the first time NODE_ENV appears in one.
    ok("short env values are left alone", scrubSecrets("mode production ok").includes("production"),
      scrubSecrets("mode production ok"));
  } finally {
    if (prev === undefined) delete process.env.RIOT_API_KEY; else process.env.RIOT_API_KEY = prev;
  }
}

console.log("== end to end: a real adapter, a stubbed 400 ==");
{
  // Proves the wiring, not just the helper: the reason has to travel from the
  // response all the way into `StatsResult.error`, which is what `lib/sync.ts`
  // writes to `sync_error`.
  const realFetch = globalThis.fetch;
  const prevKey = process.env.RIOT_API_KEY;
  process.env.RIOT_API_KEY = "RGAPI-test-0000-0000-0000-000000000000";
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ status: { message: "Exception decrypting puuid", status_code: 400 } }),
    { status: 400, headers: { "content-type": "application/json" } },
  )) as typeof fetch;
  try {
    const res = await ADAPTERS["riot-lol"].fetchStats!({
      providerAccountId: "x".repeat(78), inGameName: "Test#EUW", region: "euw1",
    });
    ok("the sync fails, as it should", !res.ok);
    if (!res.ok) {
      has("…the status is still there", res.error, "400");
      has("…the host is still there", res.error, "riotgames.com");
      has("…AND Riot's reason is now there", res.error, "Exception decrypting");
      ok("…and the key is not", !res.error.includes(process.env.RIOT_API_KEY!), res.error);
      ok("…and it fits the 300-char column", res.error.length <= 300, String(res.error.length));
    }
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.RIOT_API_KEY; else process.env.RIOT_API_KEY = prevKey;
  }
}

console.log("== the helper is still the only place that throws this ==");
{
  // If a second hand-rolled `throw new Error("HTTP …")` appears, it will be
  // blind again and nobody will notice until the next outage.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../lib/providers/adapters.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  const throws = [...src.matchAll(/throw new Error\(`HTTP \$\{[^`]*`\)/g)];
  ok("exactly one HTTP throw in the file", throws.length === 1, String(throws.length));
  ok("…and it appends the explanation", /\$\{why\}`\)/.test(throws[0]?.[0] ?? ""), throws[0]?.[0] ?? "none");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
