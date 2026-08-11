/**
 * A portal key may not be derivable from anything public. BR1.
 *
 * ===== THE DEFECT =====
 *
 * Two seeds minted keys out of public identifiers:
 *
 *     brands          `DEMO-${slug.toUpperCase()}`
 *     discord_guilds  `DEMO-${guildId.slice(-8)}`
 *
 * A brand's slug is in the brand's own public URL, so
 * `/brands/ionmark?key=DEMO-IONMARK` opened Ionmark's campaigns, spend,
 * delivery and billing to anybody who could read an address bar. The audit
 * confirmed it by guessing one.
 *
 * Production never ran the demo seed, so this was never live. That is a fact
 * about history, not a property of the code, and the next person to point the
 * seed at a real database would not know to check — so the code now knows.
 *
 * ===== WHAT IS ACTUALLY BEING TESTED =====
 *
 * Not "does `demoOnlyKey` return its argument". The two questions worth asking
 * are whether it REFUSES off-demo, and whether the seeds actually go through
 * it — the second being the half that a passing unit test of the first would
 * have hidden completely.
 *
 *   DEMO_DB=1 npx tsx tests/db/portal-keys.mts
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
/** Source with comments stripped — every file here explains the hole it closed. */
const code = (p: string) => readFileSync(at(p), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

const { demoOnlyKey, isDemoKey, rotateDemoKeys, predictableKeyCount, DEMO_KEY_REFUSED } =
  await import("../../lib/demo-keys.ts");
const { newPortalKey } = await import("../../lib/portal-auth.ts");
const { newAccessKey } = await import("../../lib/brands.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();

const ENV = { ...process.env };
const restoreEnv = () => {
  for (const k of ["DEMO_DB", "DATABASE_URL"]) {
    if (ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ENV[k];
  }
};

console.log("== the generators produce something unguessable ==");
{
  const keys = new Set(Array.from({ length: 200 }, () => newPortalKey()));
  eq("200 portal keys are 200 distinct portal keys", keys.size, 200);
  const akeys = new Set(Array.from({ length: 200 }, () => newAccessKey()));
  eq("200 brand keys are 200 distinct brand keys", akeys.size, 200);
  ok("neither is derived from anything public",
    ![...keys, ...akeys].some((k) => /DEMO-/.test(k)));
}

console.log("== a predictable key outside the demo is a HARD FAILURE ==");
{
  eq("inside the demo it is allowed through", demoOnlyKey("DEMO-IONMARK"), "DEMO-IONMARK");

  delete process.env.DEMO_DB;
  process.env.DATABASE_URL = "postgres://example/real";
  let threw: unknown = null;
  try { demoOnlyKey("DEMO-IONMARK"); } catch (e) { threw = e; }
  ok("against a real database it throws", threw instanceof Error, String(threw).slice(0, 90));
  ok("…and the message says which key and why",
    threw instanceof Error && threw.message.startsWith(DEMO_KEY_REFUSED) && /DEMO-IONMARK/.test(threw.message));
  restoreEnv();
}

console.log("== and the seeds go THROUGH it, rather than intending to ==");
{
  // The half a unit test cannot see. `demoOnlyKey` refusing correctly is worth
  // nothing if a seed still writes the literal itself.
  const seed = code("lib/db/seed.ts");
  const activity = code("lib/db/seed-activity.ts");
  for (const [name, src] of [["seed.ts", seed], ["seed-activity.ts", activity]] as const) {
    const literals = src.match(/`DEMO-\$\{[^`]*`/g) ?? [];
    ok(`${name} still builds its demo key`, literals.length > 0, "the fixture the browser suites need is gone");
    ok(`…and every one of them is wrapped in demoOnlyKey()`,
      literals.every((lit) => new RegExp(`demoOnlyKey\\(\\s*${lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(src)),
      literals.join(" "));
  }
}

console.log("== rotation clears anything predictable that already exists ==");
{
  const brandId = uid();
  const guildId = `9${Date.now()}`.slice(0, 18);
  await db.insert(schema.brands).values({ id: brandId, name: "Rotate Me", slug: `rotate-${brandId.slice(0, 5).toLowerCase()}`, accessKey: "DEMO-ROTATEME" });
  await db.insert(schema.discordGuilds).values({ guildId, name: "Rotate Guild", portalKey: "DEMO-ROTATE01" });

  const before = await predictableKeyCount(db);
  ok("the fixtures are visible as predictable", before >= 2, `count ${before}`);

  // In the demo they are legitimate, so rotation must leave them alone —
  // otherwise every screenshot URL in lib/shots.ts breaks on the next boot.
  await rotateDemoKeys(db);
  eq("…and inside the demo, rotation is a no-op", await predictableKeyCount(db), before);

  delete process.env.DEMO_DB;
  process.env.DATABASE_URL = "postgres://example/real";
  const report = await rotateDemoKeys(db);
  restoreEnv();

  ok("off-demo it rotates the brand", report.brands >= 1, JSON.stringify(report));
  ok("…and the server", report.guilds >= 1, JSON.stringify(report));

  const [b] = await db.select({ k: schema.brands.accessKey }).from(schema.brands).where(sqlEq(schema.brands.id, brandId));
  const [g] = await db.select({ k: schema.discordGuilds.portalKey }).from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guildId));
  ok("the brand's key is no longer derivable from its slug", !isDemoKey(b?.k), String(b?.k));
  ok("the server's key is no longer derivable from its id", !isDemoKey(g?.k), String(g?.k));
  // Each row gets its OWN key. One UPDATE with one generated value would rotate
  // everything to the same secret, which is worse than the bug being fixed.
  ok("…and the two rotated rows did not receive the same key", b?.k !== g?.k, `${b?.k} / ${g?.k}`);

  await db.delete(schema.brands).where(sqlEq(schema.brands.id, brandId));
  await db.delete(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guildId));
}

console.log("== boot runs the rotation ==");
{
  const src = code("lib/db/index.ts");
  ok("ensureProvisioned calls rotateDemoKeys", /rotateDemoKeys\(db\)/.test(src));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
