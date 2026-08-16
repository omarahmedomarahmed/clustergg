// The nav, in four states, and the switcher — 12 §10.
//
// The rule this file exists for is one word long: **never a brand.** A brand
// in the context switcher is the most natural-looking mistake available on
// this surface — it is another portal the person can reach — and it is the one
// that quietly merges two account systems 07 keeps apart on purpose (I2, I4).

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import {
  backToDashboardHref,
  navStateFor,
  showsSiteNav,
  switcherFor,
  type NavFacts,
} from "../../lib/site/nav.ts";

const base: NavFacts = {
  gamer: null,
  brand: null,
  managedGuilds: [],
  installableGuilds: [],
  onPublicSite: false,
};
const facts = (over: Partial<NavFacts>): NavFacts => ({ ...base, ...over });

const GAMER = { displayName: "Kestrel", slug: "kestrel" };
const BRAND = { id: "b1", name: "Acme Energy" };

// ── The four states ─────────────────────────────────────────────────────────

test("the nav has exactly four states, and each is reachable", () => {
  eq(navStateFor(facts({})), "guest", "nobody signed in");
  eq(navStateFor(facts({ gamer: GAMER })), "gamer", "a gamer");
  eq(
    navStateFor(facts({ gamer: GAMER, managedGuilds: [{ guildId: "g1", name: "Nightfall" }] })),
    "server_manager",
    "a gamer who manages a server",
  );
  eq(navStateFor(facts({ brand: BRAND })), "brand", "a brand on their dashboard");
  eq(
    navStateFor(facts({ brand: BRAND, onPublicSite: true })),
    "guest",
    "and a brand browsing the public site gets the guest nav (12 §10)",
  );
});

test("a brand is decided first, whatever else is in the browser", () => {
  // Two tabs on one machine is entirely normal. Deciding gamer-first would put
  // a brand nav on a gamer's screen the moment somebody signed into both, and
  // I4 says a gamer never sees a brand nav.
  const both = facts({
    gamer: GAMER,
    brand: BRAND,
    managedGuilds: [{ guildId: "g1", name: "Nightfall" }],
  });
  eq(navStateFor(both), "brand", "on a brand page, the brand surface wins");
  eq(
    navStateFor({ ...both, onPublicSite: true }),
    "guest",
    "and on the public site they are a guest, not a server manager",
  );
});

test("the brand dashboard has no site nav", () => {
  // 12 §10 — a SaaS dashboard with a side nav. A site nav on it offers a brand
  // user the gamer surfaces I4 says they never see.
  no(showsSiteNav("brand"), "no site nav on the brand dashboard");
  ok(showsSiteNav("guest"), "the public site has one");
  ok(showsSiteNav("gamer"), "and so does a gamer");
  ok(showsSiteNav("server_manager"), "and a server manager — it is the same nav plus a switcher");
});

// ── The switcher ────────────────────────────────────────────────────────────

test("a brand never appears in the switcher", () => {
  // ===== THE ONE RULE THIS FILE IS FOR =====
  //
  // The brand is not filtered out at the end — it is **never a source**. A
  // filter is a line somebody deletes while tidying; an absent input cannot be
  // restored by accident.
  const entries = switcherFor(
    facts({
      gamer: GAMER,
      brand: BRAND,
      managedGuilds: [{ guildId: "g1", name: "Nightfall" }],
      installableGuilds: [{ guildId: "g2", name: "Dawnbreak" }],
    }),
  );

  eq(
    entries.map((e) => e.kind),
    ["gamer", "server", "install"],
    "playing as, each server they manage, and each they could add Cluster to",
  );
  no(
    entries.some((e) => /Acme/i.test(e.label)),
    "and the brand they are signed into in another tab is not one of them",
  );
  no(
    entries.some((e) => e.href.includes("/portal/brand")),
    "nor is any route into one",
  );
});

test("the switcher lists what 12 §10 says it lists", () => {
  const entries = switcherFor(
    facts({
      gamer: GAMER,
      managedGuilds: [
        { guildId: "g1", name: "Nightfall" },
        { guildId: "g2", name: "Dawnbreak" },
      ],
      installableGuilds: [{ guildId: "g3", name: "Ironclad" }],
    }),
  );

  eq(entries[0].label, "Playing as Kestrel", "*Playing as <name>*");
  eq(entries[0].href, "/profile", "which is their own profile");
  eq(entries[1].label, "Nightfall", "each server they manage, by name");
  eq(
    entries[1].href,
    "/portal/server/g1",
    "and selecting one goes to that server's portal — 12 §10, it becomes their homepage",
  );
  eq(entries[3].label, "Add Cluster to Ironclad", "*Add Cluster to <server>* for the ones without it");
  ok(
    entries[3].href.startsWith("/api/auth/discord/install"),
    "pointed at the round trip that captures the installer (G1), not at a marketing page",
  );
  ok(
    entries[3].href.includes("guildId=g3"),
    "with the server pre-selected, so they do not install into the wrong one",
  );
});

test("a guest has no switcher at all", () => {
  // The negative half: without it, a `switcherFor` that always returned the
  // gamer entry would satisfy every assertion above.
  eq(switcherFor(facts({})), [], "nobody signed in, nothing to switch between");
  eq(
    switcherFor(facts({ brand: BRAND })),
    [],
    "and a brand has no switcher either — they are not a person with contexts",
  );
});

test("a gamer who manages nothing still gets a switcher with themselves in it", () => {
  // 12 §2 — *a gamer who manages nothing is never asked about servers.* They
  // still get the entry, because the switcher is also how they find their own
  // profile, and an empty control that appears the day they install a bot is
  // worse than one that was always there.
  const entries = switcherFor(facts({ gamer: GAMER }));
  eq(entries.length, 1, "one entry");
  eq(entries[0].kind, "gamer", "themselves");
});

// ── Back to dashboard ───────────────────────────────────────────────────────

test("a brand browsing the public site gets a way back", () => {
  // 12 §10. Without it they are stranded: the brand portal has no site nav by
  // design, so a brand who clicks through to /pool from an email has no link
  // back and no reason to believe they are still signed in.
  eq(
    backToDashboardHref(facts({ brand: BRAND, onPublicSite: true })),
    "/portal/brand/b1",
    "back to their own dashboard",
  );
  eq(
    backToDashboardHref(facts({ brand: BRAND, onPublicSite: false })),
    null,
    "and not on the dashboard itself, where it would point at the page they are on",
  );
  eq(
    backToDashboardHref(facts({ gamer: GAMER, onPublicSite: true })),
    null,
    "a gamer is never offered a brand dashboard, which is I4",
  );
});
