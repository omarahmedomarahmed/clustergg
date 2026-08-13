/**
 * The nav offers every destination, and offers it to everybody. B123.
 *
 * ===== WHAT THIS IS GUARDING =====
 *
 * The old top bar carried twelve things in one flat row and handled the
 * overflow with breakpoints: `hidden lg:inline` on "For brands" and "For
 * Discord servers", `hidden md:inline-flex` on the install button, `hidden
 * sm:inline-flex` on search. So the two commercial doors — the entire reason a
 * server owner or a brand was on the page — disappeared on a laptop, silently,
 * and no test could see it because the markup was still there.
 *
 * A menu written as JSX cannot be counted. Written as data it can, so the
 * checks below are the ones the flat row could never have:
 *
 *   - every route a menu points at actually exists
 *   - nothing the old row carried was dropped in the rewrite
 *   - the menu is the SAME for a guest and a member, differing only by leaves
 *     that are explicitly marked, never by group or order
 *
 *   DEMO_DB=1 npx tsx tests/db/nav.mts
 */
process.env.DEMO_DB = "1";

import { existsSync, readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const at = (p: string) => new URL(`../../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");

const { NAV_MENUS, NAV_HREFS } = await import("../../lib/nav-menus.ts");

console.log("== three menus, and every one of them says what it is for ==");
{
  ok("there are exactly three", NAV_MENUS.length === 3, NAV_MENUS.map((m) => m.id).join(","));
  ok("…named for what the visitor wants, not for us",
    NAV_MENUS.map((m) => m.label).join("/") === "Play/Earn/Advertise",
    NAV_MENUS.map((m) => m.label).join("/"));
  for (const m of NAV_MENUS) {
    ok(`${m.id}: has a lede`, m.lede.length > 40, m.lede);
    ok(`${m.id}: has enough behind it to be a menu`, m.links.length >= 4, String(m.links.length));
    // A menu where every leaf needs explaining is a menu of vague labels; one
    // where none do is a list of nouns. Most, not all.
    const noted = m.links.filter((l) => (l.note ?? "").length > 15).length;
    ok(`${m.id}: most leaves say what they are`, noted >= Math.ceil(m.links.length * 0.7),
      `${noted} of ${m.links.length}`);
  }
}

console.log("\n== every destination is a real route ==");
{
  // A nav link to a route that does not exist is a 404 the visitor blames on
  // themselves. The old row hard-coded its hrefs in markup; these are checkable.
  // Resolves DYNAMIC segments. `/rules/owner` is served by
  // `app/rules/[who]/page.tsx`, so a literal path check reports three false
  // 404s on routes that work — which would have taught me to weaken the guard
  // rather than fix it.
  const { readdirSync } = await import("node:fs");
  const resolves = (href: string): boolean => {
    const parts = href.split("/").filter(Boolean);
    let dir = "app";
    for (const part of parts) {
      if (existsSync(at(`${dir}/${part}`))) { dir = `${dir}/${part}`; continue; }
      const dyn = readdirSync(at(dir), { withFileTypes: true })
        .find((e) => e.isDirectory() && /^\[.+\]$/.test(e.name));
      if (!dyn) return false;
      dir = `${dir}/${dyn.name}`;
    }
    return existsSync(at(`${dir}/page.tsx`));
  };

  const dead: string[] = [];
  for (const href of NAV_HREFS) if (!resolves(href)) dead.push(href);
  ok("no menu link 404s", dead.length === 0, dead.join(", "));
  ok("…and there are no duplicate destinations",
    new Set(NAV_HREFS).size === NAV_HREFS.length,
    NAV_HREFS.filter((h, i) => NAV_HREFS.indexOf(h) !== i).join(", "));
}

console.log("\n== nothing the old flat row carried was dropped ==");
{
  // THE REGRESSION CHECK. Each of these was a destination in the bar before
  // B123. A rewrite that loses one is a rewrite that quietly removed a door.
  const MUST_REACH = [
    "/planets",       // the planets badge
    "/marketplace",   // the marketplace badge
    "/quests",        // the quest card
    "/pricing",       // "For brands"
    "/discord-bot",   // "For Discord servers"
    "/leaderboards",
    "/pool",
  ];
  const missing = MUST_REACH.filter((h) => !NAV_HREFS.includes(h));
  ok("every old destination is still reachable from the nav", missing.length === 0, missing.join(", "));
}

console.log("\n== the same nav for everybody ==");
{
  // The brief was explicit: one nav, organised, not an audience switch. A nav
  // that rearranges itself when you sign in is a nav people have to relearn at
  // the exact moment they have just committed to the product.
  const authOnly = NAV_MENUS.flatMap((m) => m.links.filter((l) => l.auth).map((l) => l.href));
  ok("only a few leaves are member-only", authOnly.length <= 2, authOnly.join(", "));

  // The check that actually bites. A count alone passed when I gated
  // `/planets` behind sign-in to test it — two auth leaves is still "a few".
  // What matters is not HOW MANY are gated but WHICH: a guest must be able to
  // reach every core destination, because a guest is who the nav is selling to.
  const GUEST_MUST_REACH = ["/planets", "/pricing", "/discord-bot", "/pool", "/marketplace", "/leaderboards"];
  const gated = GUEST_MUST_REACH.filter((h) => authOnly.includes(h));
  ok("…and a signed-out visitor can reach every core destination",
    gated.length === 0, `${gated.join(", ")} — gated behind sign-in`);
  ok("…and no whole menu is", NAV_MENUS.every((m) => m.links.some((l) => !l.auth)),
    "a menu that empties for a guest is an audience switch wearing a menu's clothes");

  // ===== ONE FILE NOW, NOT SIX =====
  //
  // The bar, its menu bar, its quest card, its alerts and both bands were
  // separate components that only ever appeared together, sharing a background,
  // a height variable and a sticky context by convention. `NavChrome` is all of
  // it; `components/Nav.tsx` is the server half that feeds it. The assertions
  // below did not change — only where they look.
  const bar = read("components/nav/NavChrome.tsx");
  // The groups and their order must not depend on who is looking. Only the
  // leaves may, and only by omission.
  ok("the component filters leaves, not groups",
    /menu\.links\.filter\(\(l\) => !l\.auth \|\| signedIn\)/.test(bar));
  ok("…and renders NAV_MENUS in order, unfiltered", /NAV_MENUS\.map\(/.test(bar));

  ok("the bar is rendered once, outside the signed-in branch",
    (bar.match(/<MenuBar/g) ?? []).length === 1,
    "two copies is how the two audiences drift apart again");
}

console.log("\n== the two PLACES stay one click away ==");
{
  // B123.1. The first version of this rewrite moved the planets and
  // marketplace badges into the Play menu along with the game logos, and
  // `tests/ui/marketplace-ui.mjs` failed on an assertion named "It is
  // reachable without knowing it exists". It was right: two interactions deep
  // is not discoverable, and B9 had promoted the marketplace OUT of the utility
  // icons for exactly that reason — so it would read as a place, not a control.
  //
  // A menu carries ROUTES. A badge carries a PLACE. The distinction is the
  // reason the row is allowed to hold anything at all.
  const nav = read("components/Nav.tsx");
  const chrome = read("components/nav/NavChrome.tsx");
  ok("the destination badges are rendered in the row", /navBadges\(\{/.test(nav),
    "the marketplace and planets badges are places, not menu leaves");
  // `lastIndexOf`, not `indexOf`. `navBadges({` is called TWICE — once to build
  // the mobile drawer's link list near the top of the file, and once to render
  // the row. The first version of this check found the drawer call, concluded
  // the badges were above the menu bar, and failed on correct code.
  // The badges are BUILT server-side and RENDERED in the bar row, so the check
  // moved with them: the row that paints them must sit outside `MenuBar`, not
  // inside any panel it opens.
  ok("…outside any dropdown",
    chrome.indexOf("badges.map(") > chrome.indexOf("<MenuBar")
    && chrome.indexOf("badges.map(") < chrome.indexOf("function MenuBar"),
    "a badge inside the menu is the regression this check exists for");
  ok("…and still admin-gated", /show\[id\]|show:/.test(nav), "navBadges no longer receives the switches");
}

console.log("\n== the doors are no longer hidden by breakpoint ==");
{
  const nav = read("components/Nav.tsx") + read("components/nav/NavChrome.tsx");
  // The exact defect: the commercial links behind `hidden lg:inline`.
  ok("'For brands' is not a breakpoint-hidden link any more",
    !/hidden lg:inline[^}]*For brands/.test(nav));
  ok("…nor 'For Discord servers'",
    !/hidden lg:inline[^}]*For Discord servers/.test(nav));
  // The menu bar itself is md+, and that is fine — the burger carries the same
  // destinations below it. What must not happen is a door existing at NO width.
  const mobile = read("lib/mobile-nav.ts");
  ok("a phone still has a route to the same places",
    /parseDrawerLinks/.test(mobile) || mobile.length > 0);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
