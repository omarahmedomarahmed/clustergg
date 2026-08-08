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
// This suite predates the `eq` helper the newer ones carry. Added rather than
// rewriting every assertion below it to fit.
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { ADMIN_NAV, ownersOfPath, pagesOfSystem, accessOf, MOVED_ROUTES, movedTo } =
  await import("../../lib/admin-nav.ts");
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
    // Was ["/admin/brands/testimonials", "brand"] — a page the content desk
    // owned inside a prefix billing owned, which is the exact shape the old
    // `except` lists existed for. It stopped being that when testimonials
    // became a TAB of /admin/brands: there is no page there any more, only a
    // redirect stub, so it inherits billing like everything else under the
    // prefix. Inverted rather than deleted, because the fact it now asserts —
    // the content desk can NOT reach /admin/brands/[id] through a tab — is the
    // one worth holding. `ownersOfPath` matches by prefix, so filing the merged
    // page under both desks would have handed the content desk campaign
    // management and portal-key rotation.
    ["/admin/brands/testimonials", "billing"],
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

  console.log("\n== A page that moved is judged by where it lands ==");
  {
    // Every merge leaves a stub at the old URL, and a stub owns nothing — so
    // without `movedTo` in the guard, a staff member clicking a bookmark got a
    // 404 BEFORE the redirect ran. A 404 on a page that still exists under a
    // different name is the worst answer available: it says "gone" when the
    // truth is "moved".
    const dangling = Object.entries(MOVED_ROUTES)
      .filter(([, to]) => ownersOfPath(to.split("?")[0]).length === 0
        && !alwaysOpen(to.split("?")[0]) && !adminOnlyPath(to.split("?")[0]));
    ok("every moved route lands somewhere a desk owns", dangling.length === 0,
      dangling.map(([from, to]) => `${from} → ${to}`).join(", "));

    // The specific case each merge created.
    ok("the content desk can still open its old bookmarks",
      pathAllowedFor(["brand"], "/admin/chrome")
      && pathAllowedFor(["brand"], "/admin/mobile")
      && pathAllowedFor(["brand"], "/admin/cards/guide")
      && pathAllowedFor(["brand"], "/admin/translations"));
    ok("billing can still open the old enquiries URL", pathAllowedFor(["billing"], "/admin/brand-enquiries"));

    // …and a redirect is not a way in. The destination's rule is the rule.
    ok("a moved route does not widen access",
      !pathAllowedFor(["trophies"], "/admin/chrome")
      && !pathAllowedFor(["bot"], "/admin/brand-enquiries"));

    // The merge that could have leaked. Testimonials were the content desk's,
    // and /admin/brands is billing's — so filing the merged page under both
    // would have given the content desk everything under the prefix, including
    // the campaign controls and the portal-key reset on /admin/brands/[id].
    ok("merging testimonials in did not hand the content desk a brand's keys",
      !pathAllowedFor(["brand"], "/admin/brands/some-brand-id")
      && !pathAllowedFor(["brand"], "/admin/brands"));

    // The stub files and this map must not drift. Each stub reads its
    // destination from MOVED_ROUTES, so a key that no stub uses is a redirect
    // nobody serves, and a stub whose key is missing is a crash.
    const { readFileSync } = await import("node:fs");
    const missing = Object.keys(MOVED_ROUTES).filter((from) => {
      try { return !readFileSync(`app${from}/page.tsx`, "utf8").includes(`MOVED_ROUTES["${from}"]`); }
      catch { return true; }
    });
    ok("every moved route has a stub that reads this map", missing.length === 0, missing.join(", "));

    eq("movedTo strips the query", movedTo("/admin/cards/guide"), "/admin/art");
    eq("and returns null for a page that did not move", movedTo("/admin/challenges"), null);
  }

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

// ===== B29: nothing ships without an owner in the taxonomy =====
//
// The rescoped item is the AUDIT and the assertion, not a retrofit — the
// mechanism already fails safe (`pathAllowedFor` treats a page no desk claims as
// admin-only). What was missing is a check that keeps it true as pages are
// added, and a decision on the pages that are unowned today.

console.log("\n== every admin page is either OWNED or deliberately admin-only ==");
{
  const { ADMIN_ONLY, ALWAYS_OPEN_EXACT, ALWAYS_OPEN_UNDER, pathAllowedFor, SYSTEMS } =
    await import("../../lib/systems.ts");
  const { ownersOfPath } = await import("../../lib/admin-nav.ts");
  const { readFile } = await import("node:fs/promises");

  const nav = await readFile(new URL("../../lib/admin-nav.ts", import.meta.url), "utf8");
  const hrefs = [...nav.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]);
  ok("the console has pages", hrefs.length > 10, String(hrefs.length));

  // Three legitimate categories, and NO fourth. A page that is none of these is
  // a page somebody added without deciding who runs it.
  const unowned: string[] = [];
  for (const href of [...new Set(hrefs)]) {
    const owned = ownersOfPath(href).length > 0;
    const adminOnly = ADMIN_ONLY.some((p) => href === p || href.startsWith(`${p}/`));
    const open = ALWAYS_OPEN_EXACT.includes(href)
      || ALWAYS_OPEN_UNDER.some((p) => href === p || href.startsWith(`${p}/`));
    if (!owned && !adminOnly && !open) unowned.push(href);
  }
  // These are unowned BY DECISION — each is a founder/operator surface with no
  // department that should run it, and `pathAllowedFor` already refuses them.
  // Listed here so adding a page to the console without filing it fails this
  // test rather than becoming invisible.
  const DELIBERATELY_UNOWNED = [
    "/admin/messages", "/admin/analytics", "/admin/dataroom", "/admin/audit-log",
    "/admin/discord/hq", "/admin/roles", "/admin/departments", "/admin/storage",
    "/admin/settings",
  ];
  const surprises = unowned.filter((h) => !DELIBERATELY_UNOWNED.includes(h));
  eq("no page is unowned by accident", surprises, []);
  // …and every one of those is genuinely refused, not just listed.
  const everything = SYSTEMS.map((s2) => s2.key);
  for (const href of unowned) {
    ok(`"${href}" refuses a department that runs EVERYTHING`, !pathAllowedFor(everything, href));
  }

  console.log("\n== the standing exceptions refuse everyone ==");
  // /admin/users and /admin/linked-accounts are the gamer directory and every
  // linked game account — the most sensitive thing in the product. /admin/payments
  // was admin-only only by the unclaimed FALLBACK; filing it under a system later
  // would have quietly handed it over. It is now on the list by decision.
  for (const path of ["/admin/users", "/admin/linked-accounts", "/admin/payments"]) {
    ok(`${path} is on the explicit list`, ADMIN_ONLY.includes(path), JSON.stringify(ADMIN_ONLY));
    ok(`…and refuses a department granted every system`, !pathAllowedFor(everything, path));
    ok(`…and refuses a sub-path too`, !pathAllowedFor(everything, `${path}/anything`));
  }

  console.log("\n== a department reaches its own pages and no others ==");
  const withOwners = [...new Set(hrefs)].filter((h) => ownersOfPath(h).length > 0);
  const sample = withOwners.find((h) => ownersOfPath(h).length === 1);
  ok("there is a singly-owned page to test with", !!sample, String(sample));
  if (sample) {
    const owner = ownersOfPath(sample)[0];
    ok(`a department running "${owner}" reaches ${sample}`, pathAllowedFor([owner], sample));
    const notMine = withOwners.filter((h) => !ownersOfPath(h).includes(owner));
    const leaked = notMine.filter((h) => pathAllowedFor([owner], h));
    eq("…and reaches nothing it does not own", leaked, []);
  }

  console.log("\n== no page checks permissions on its own ==");
  // The failure this prevents: a page that works because you happen to be an
  // admin, with its own inline role check, invisible to the department editor.
  const { readdir } = await import("node:fs/promises");
  const walk = async (dir: URL): Promise<URL[]> => {
    const out: URL[] = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const next = new URL(`${e.name}${e.isDirectory() ? "/" : ""}`, dir);
      if (e.isDirectory()) out.push(...await walk(next));
      else if (e.name === "page.tsx") out.push(next);
    }
    return out;
  };
  const pages = await walk(new URL("../../app/admin/", import.meta.url));
  ok("there are admin pages to check", pages.length > 10, String(pages.length));
  // What actually matters is that every page GOES THROUGH a guard. A role
  // comparison on its own is not the smell — the first version of this flagged
  // `/admin/roles` (which uses `isSuper` to decide whether the page lets you
  // EDIT, inside a page already guarded) and `/admin/users` (which reads the
  // role of the person in the ROW, not the viewer). Both are correct. The
  // failure to catch is a page with no guard at all, which works only because
  // you happen to be an admin and is invisible to the department editor.
  // The guard is in the LAYOUT, not on each page — one gate for the whole area,
  // which is the right architecture and which my first two attempts at this
  // assertion both missed. Forty pages have no guard call in the page file
  // because they do not need one.
  const layout = await readFile(new URL("../../app/admin/layout.tsx", import.meta.url), "utf8");
  ok("the admin layout refuses a signed-out visitor", /redirect\("\/login"\)/.test(layout));
  ok("…and a non-staff one", /isStaff\(user\)/.test(layout));
  ok("…and gates every path through the TAXONOMY, not a role list",
    /pathAllowedFor\(systems, path\)/.test(layout), "");
  ok("…refusing with notFound rather than a redirect that names the page",
    /pathAllowedFor\(systems, path\)\) notFound\(\)/.test(layout));

  // So the thing to catch on a PAGE is one that builds its own gate anyway —
  // parallel permission logic that the department editor cannot see. A role
  // comparison alone is not that: /admin/roles uses `isSuper` to decide whether
  // an already-guarded page lets you EDIT, and /admin/users reads the role of
  // the person in the ROW. Both flagged by my first version; both correct.
  const roleOnly: string[] = [];
  for (const f of pages) {
    const text = await readFile(f, "utf8");
    const rel = f.pathname.split("/app/")[1];
    // A page that redirects or 404s on its own role check is gating itself.
    if (/(redirect|notFound)\(\)?[^;]*\)[^;]*;?\s*$/m.test(text)
      && /\b(me|user|viewer)\??\.role\s*===\s*"[^"]+"\s*\)?\s*\)?\s*(\?|&&|\|\|)?[^;]{0,40}(redirect|notFound)/.test(text)) {
      roleOnly.push(rel);
    }
  }
  eq("no page builds its own gate beside the layout's", roleOnly, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
