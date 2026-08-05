/**
 * One map of the platform, not two.
 *
 * Which pages exist and where they sit lived in lib/admin-nav.ts. Which pages a
 * department could open lived in lib/systems.ts, as a parallel list of path
 * prefixes with an `except` list to patch the overlaps. Two lists of the same
 * pages is two lists that can disagree — and they did.
 *
 * The owner is now declared beside the page, once, and systems.ts reads it back.
 * These assertions are about that being true rather than nearly true: every page
 * filed, every desk's pages derived, and the prefix behaviour that made the old
 * `except` lists necessary still correct without them.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { ADMIN_NAV, ownersOfPath, pagesOfSystem, accessOf } = await import("../../lib/admin-nav.ts");
const { SYSTEMS, pathAllowedFor, ALWAYS_OPEN_EXACT, ALWAYS_OPEN_UNDER, ADMIN_ONLY, systemForPath } =
  await import("../../lib/systems.ts");

const allItems = ADMIN_NAV.flatMap((g) => g.items);
const alwaysOpen = (h: string) =>
  ALWAYS_OPEN_EXACT.includes(h) || ALWAYS_OPEN_UNDER.some((p) => h === p || h.startsWith(`${p}/`));
const adminOnlyPath = (h: string) => ADMIN_ONLY.some((p) => h === p || h.startsWith(`${p}/`));

try {
  console.log("\n== Every page in the console is filed ==");
  // Filed means: someone can say who opens it without reading two files.
  const unfiled = allItems.filter((i) =>
    !alwaysOpen(i.href) && !adminOnlyPath(i.href) && !i.area && !i.adminOnly
    && ownersOfPath(i.href).length === 0);
  ok("no page is unowned by accident", unfiled.length === 0,
    unfiled.map((i) => `${i.href} (${i.label})`).join(", "));

  console.log("\n== Each desk's pages come from the console ==");
  for (const sys of SYSTEMS) {
    const pages = pagesOfSystem(sys.key);
    // `identity` deliberately owns nothing: its two pages are the gamer
    // directory and the linked-account list, which are ADMIN_ONLY.
    if (sys.key === "identity") {
      ok(`${sys.key} owns nothing, on purpose`, pages.length === 0, pages.map((p) => p.href).join(","));
      continue;
    }
    ok(`${sys.key} owns pages`, pages.length > 0, "0 pages — the desk has nothing to do");
  }

  console.log("\n== The prefix cases the old `except` lists existed for ==");
  const cases: [string, string][] = [
    ["/admin/discord", "bot"],
    ["/admin/discord/analytics", "bot"],
    ["/admin/discord/requests", "challenges"],
    ["/admin/discord/broadcast", "ad"],
    ["/admin/brands", "billing"],
    ["/admin/brands/testimonials", "brand"],
    ["/admin/games", "planets"],
    ["/admin/challenges", "challenges"],
    ["/admin/trophies", "trophies"],
  ];
  for (const [path, want] of cases) {
    const got = ownersOfPath(path);
    ok(`${path} → ${want}`, got.includes(want as never), got.join(",") || "nobody");
  }
  // The deepest declaration wins, which is what removes the need for `except`.
  ok("a child page overrides its parent's owner",
    !ownersOfPath("/admin/discord/requests").includes("bot" as never),
    ownersOfPath("/admin/discord/requests").join(","));
  // `/admin/discord` is marked `exact` for the rail. Ownership must ignore that,
  // or the page where a server is actually administered belongs to nobody.
  ok("a detail page under an `exact` parent is still owned",
    ownersOfPath("/admin/discord/123456789").includes("bot" as never),
    ownersOfPath("/admin/discord/123456789").join(",") || "nobody");
  ok("and so is a challenge detail page",
    ownersOfPath("/admin/challenges/abc").includes("challenges" as never));

  console.log("\n== The guard agrees with the map ==");
  for (const sys of SYSTEMS) {
    const mine = pagesOfSystem(sys.key);
    if (mine.length === 0) continue;
    const denied = mine.filter((i) => !pathAllowedFor([sys.key], i.href));
    ok(`${sys.key} can open everything it owns`, denied.length === 0, denied.map((d) => d.href).join(","));
  }
  // …and nothing it doesn't.
  const botCanReach = allItems.filter((i) => pathAllowedFor(["bot"], i.href)).map((i) => i.href);
  ok("the bot desk cannot open the ad desk's pages", !botCanReach.includes("/admin/creatives"),
    botCanReach.join(","));
  ok("nor the trophy desk's", !botCanReach.includes("/admin/redeems"));

  console.log("\n== The shared page is shared, without a special case ==");
  ok("the inbox belongs to two desks", ownersOfPath("/admin/messages").length === 2,
    ownersOfPath("/admin/messages").join(","));
  ok("the bot desk can open it", pathAllowedFor(["bot"], "/admin/messages"));
  ok("so can the brand desk", pathAllowedFor(["brand"], "/admin/messages"));
  ok("the trophy desk cannot", !pathAllowedFor(["trophies"], "/admin/messages"));

  console.log("\n== The community stays closed to every desk ==");
  for (const sys of SYSTEMS) {
    const leak = ADMIN_ONLY.filter((p) => pathAllowedFor([sys.key], p));
    if (leak.length) ok(`${sys.key} cannot read the gamer directory`, false, leak.join(","));
  }
  ok("no department can reach /admin/users or /admin/linked-accounts",
    SYSTEMS.every((s) => ADMIN_ONLY.every((p) => !pathAllowedFor([s.key], p))));

  console.log("\n== systemForPath still answers ==");
  ok("it resolves a page to a desk", systemForPath("/admin/challenges")?.key === "challenges",
    String(systemForPath("/admin/challenges")?.key));
  ok("and returns nothing for an unclaimed one", systemForPath("/admin/settings") === null,
    String(systemForPath("/admin/settings")?.key));

  console.log("\n== Access labels still make sense ==");
  ok("area-gated pages read as grantable or admin",
    allItems.filter((i) => i.area).every((i) => accessOf(i.area) !== "staff"));
} catch (e) {
  fail++;
  console.log("  ✗ threw:", (e as Error).message);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
