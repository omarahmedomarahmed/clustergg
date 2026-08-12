/**
 * Who can open a portal, and who becomes the first superadmin. B104.
 *
 * Two holes, one theme: a guard that decides authority from something other
 * than authority.
 *
 * ===== SEC2 — THE PORTAL SIGNING SECRET =====
 *
 * A portal session cookie is `HMAC(secret, "<kind>:<id>")` and depends on
 * nothing else — not the key, not a nonce. So the secret IS the credential for
 * every brand and every server at once. It used to fall back to `CRON_SECRET`,
 * then `BOT_API_SECRET`, then a per-process random value:
 *
 *   * the first two are handed out for scheduling and command registration, so
 *     three trust boundaries shared one value and the weakest set the strength;
 *   * the random one made an unconfigured deployment LOOK fine while signing
 *     every portal session out on each cold start.
 *
 * ===== F5 — THE FIRST SUPERADMIN =====
 *
 * `signUp` promoted whoever arrived when `count(users) === 0`. On a fresh
 * production database that is a race anyone who found the domain could enter,
 * and `/api/setup` advertised it in its own response text. The test that
 * matters is not "does the new code work" but "can being early still be enough"
 * — so the empty-database case is asserted to yield `user`.
 *
 *   DEMO_DB=1 npx tsx tests/db/bootstrap.mts
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
const read = (p: string) => readFileSync(at(p), "utf8");

const { signPayload, PORTAL_SECRET_MISSING } = await import("../../lib/portal-auth.ts");
const { bootstrapRoleFor, nominateSuperadmin, nominatedSuperadmin, BOOTSTRAP_ADMIN_KEY } =
  await import("../../lib/bootstrap.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, sql } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();

// Save and restore the environment around each case. A suite that leaks
// PORTAL_SECRET into the next assertion proves nothing about the one before it.
const ENV = { ...process.env };
const restoreEnv = () => {
  for (const k of ["PORTAL_SECRET", "CRON_SECRET", "BOT_API_SECRET", "DATABASE_URL", "DEMO_DB"]) {
    if (ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ENV[k];
  }
};

console.log("== SEC2: the portal secret is PORTAL_SECRET, and only PORTAL_SECRET ==");
{
  // The signature must MOVE when PORTAL_SECRET moves — otherwise everything
  // below is asserting against a constant.
  process.env.PORTAL_SECRET = "aaaa-one";
  const one = signPayload("server:abc");
  process.env.PORTAL_SECRET = "bbbb-two";
  const two = signPayload("server:abc");
  ok("the signature follows PORTAL_SECRET", one !== two, `${one} vs ${two}`);

  // THE ACTUAL ATTACK. Somebody holding BOT_API_SECRET (given to whoever
  // registers slash commands) or CRON_SECRET (pasted into a scheduler) must not
  // be able to sign a portal session. With the old fallback chain, unsetting
  // PORTAL_SECRET made one of theirs the signing key.
  process.env.PORTAL_SECRET = "the-real-one";
  const real = signPayload("brand:xyz");
  process.env.CRON_SECRET = "cron-value";
  process.env.BOT_API_SECRET = "bot-value";
  eq("CRON_SECRET does not change the signature", signPayload("brand:xyz"), real);
  eq("BOT_API_SECRET does not change the signature", signPayload("brand:xyz"), real);

  // The two above are worth less than they look: with PORTAL_SECRET set, a
  // `||` chain short-circuits before it reaches either, so both stayed GREEN
  // against a deliberately restored fallback. The case that actually
  // distinguishes the two implementations is PORTAL_SECRET *unset* — so assert
  // on what the signature IS, not merely that it did not move.
  delete process.env.PORTAL_SECRET;
  process.env.CRON_SECRET = "cron-value";
  process.env.BOT_API_SECRET = "bot-value";
  process.env.DEMO_DB = "1";
  const withNeighbours = signPayload("brand:xyz");
  delete process.env.CRON_SECRET;
  delete process.env.BOT_API_SECRET;
  eq("with no PORTAL_SECRET, the neighbours' values are not borrowed",
    withNeighbours, signPayload("brand:xyz"));

  delete process.env.PORTAL_SECRET;
  process.env.CRON_SECRET = "cron-value";
  process.env.BOT_API_SECRET = "bot-value";
  // Both halves of "is this a real deployment": DEMO_DB is set at the top of
  // this file and would otherwise keep the demo exemption alive.
  delete process.env.DEMO_DB;
  process.env.DATABASE_URL = "postgres://example/not-really-used-here";
  let threw: unknown = null;
  try { signPayload("brand:xyz"); } catch (e) { threw = e; }
  ok("a real deployment with no PORTAL_SECRET THROWS rather than borrowing one",
    threw instanceof Error && threw.message === PORTAL_SECRET_MISSING,
    threw instanceof Error ? threw.message.slice(0, 80) : String(threw));
  ok("…and the message names the variable and how to make one",
    /PORTAL_SECRET/.test(PORTAL_SECRET_MISSING) && /openssl rand/.test(PORTAL_SECRET_MISSING));

  // The in-process demo is the one exemption, and it must be STABLE: a value
  // that changed per process is what hid the missing secret in the first place.
  delete process.env.DATABASE_URL;
  process.env.DEMO_DB = "1";
  eq("the demo secret is deterministic across calls", signPayload("server:abc"), signPayload("server:abc"));
  ok("…and is not the production path", signPayload("server:abc") !== real);

  restoreEnv();
}

console.log("== SEC2: and the fallbacks are gone from the source, not just unused ==");
{
  const src = read("lib/portal-auth.ts");
  // Scoped to the function that resolves the secret. The comment above it names
  // both variables on purpose — explaining why they are gone is the point of it
  // — so a bare grep over the file would fail on its own documentation.
  const fn = src.slice(src.indexOf("function secret()"), src.indexOf("function secret()") + 400);
  ok("secret() does not read CRON_SECRET", !/CRON_SECRET/.test(fn), fn.slice(0, 120));
  ok("secret() does not read BOT_API_SECRET", !/BOT_API_SECRET/.test(fn));
  ok("secret() mints no random fallback", !/randomBytes/.test(fn));
}

console.log("== F5: the first superadmin is nominated, not raced for ==");
{
  await db.delete(schema.platformSettings).where(sqlEq(schema.platformSettings.key, BOOTSTRAP_ADMIN_KEY));

  // The demo database already has a superadmin, so "no superadmin exists" has
  // to be arranged rather than assumed. Park the real ones on a sentinel role
  // and put them back at the end — the rows are needed by nothing else here.
  const supers = await db.select({ id: schema.users.id })
    .from(schema.users).where(sqlEq(schema.users.role, "superadmin"));
  const park = async (role: string) => {
    for (const s of supers) {
      await db.update(schema.users).set({ role }).where(sqlEq(schema.users.id, s.id));
    }
  };
  await park("user");

  eq("no nomination recorded", await nominatedSuperadmin(db), null);

  // THE HOLE ITSELF. Nobody has run setup with an address, and there is no
  // superadmin on the platform — the exact state a fresh deployment is in, and
  // the state the old code promoted out of.
  eq("…so an arbitrary signup on a superadmin-less platform is a plain user",
    await bootstrapRoleFor(db, "attacker@example.com"), "user");

  await nominateSuperadmin(db, "Founder@Example.COM  ");
  eq("a nomination is stored normalised", await nominatedSuperadmin(db), "founder@example.com");
  eq("the nominated address is promoted", await bootstrapRoleFor(db, "founder@example.com"), "superadmin");
  eq("…however they typed it", await bootstrapRoleFor(db, "  FOUNDER@example.com "), "superadmin");
  eq("anybody else is not", await bootstrapRoleFor(db, "attacker@example.com"), "user");

  // A nomination left in the settings table must not be a permanent back door:
  // once a superadmin exists, the claim is spent.
  const decoyId = uid();
  await db.insert(schema.users).values({
    id: decoyId, displayName: "Bootstrapped", slug: `boot-${decoyId.slice(0, 6).toLowerCase()}`,
    role: "superadmin",
  });
  eq("once a superadmin exists the nomination is spent",
    await bootstrapRoleFor(db, "founder@example.com"), "user");

  await db.delete(schema.users).where(sqlEq(schema.users.id, decoyId));
  await db.delete(schema.platformSettings).where(sqlEq(schema.platformSettings.key, BOOTSTRAP_ADMIN_KEY));
  await park("superadmin");
  const back = await db.select({ c: sql<number>`count(*)` })
    .from(schema.users).where(sqlEq(schema.users.role, "superadmin"));
  eq("the demo's own superadmins are restored", Number(back[0]?.c ?? 0), supers.length);
}

console.log("== F5: and signup no longer decides a role from a head count ==");
{
  // Comments are stripped first. The replacement is documented in a comment
  // that quotes the old expression verbatim — explaining what was wrong is the
  // point of it — so a grep over the raw file would fail on its own changelog.
  const code = (p: string) => read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

  // These are SHAPE guards, and they are here because the behavioural
  // assertions above cannot reach `register()` — it is a server action that
  // calls `headers()` and `redirect()`, neither of which exists outside a
  // request. Breaking the fix proved the point: restoring the head count left
  // every behavioural assertion GREEN, because they exercise the module and the
  // hole was at the call site.
  //
  // So they are written to resist rephrasing rather than to match one literal.
  // The rule is the strong form — signup may not compute a role from a head
  // count AT ALL, however it is spelled — and the only sanctioned source of a
  // role is `bootstrapRoleFor`.
  const src = code("app/actions/auth.ts");
  ok("signup gets its role from the nomination", /role\s*=\s*await bootstrapRoleFor\(/.test(src));
  ok("…and counts no users to decide one", !/count\s*\(/.test(src), "a count() is back in signup");
  ok("…and never names the superadmin role itself",
    !/"superadmin"/.test(src), "signup is deciding a privileged role inline again");

  const setup = code("app/api/setup/route.ts");
  ok("/api/setup takes the address", /nominateSuperadmin/.test(setup) && /"admin"/.test(setup));
  ok("…and no longer advertises the race in its response",
    !/FIRST user to sign up becomes superadmin/.test(setup), "the old note is still there");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
