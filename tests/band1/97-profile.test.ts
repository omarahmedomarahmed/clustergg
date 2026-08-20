// The gamer profile. `13-DESIGN` §5, `14-EDITABLE` §5.
//
// ===== THE LARGEST THING A NON-ADMIN CAN EDIT, AND IT WAS LOST ENTIRELY =====
//
// v1 shipped a full customization engine. v3 shipped nothing: `04-SURFACES`
// listed `/profile` and never said what was on it, so there was no profile.
// The engine here is `ported-design/theme.ts`, carried deliberately, with its
// README's changes applied on arrival — the load-bearing one being that its
// section list named `quests`, Cluster Points, badges, "recent posts" and "my
// planets", **four surfaces v3 deleted**.
//
// That is not a tidying detail. A gamer's saved theme stores its section order
// by key, so carrying v1's list would have put the deleted product back into
// the product through storage, and the builder would have offered it.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import {
  AVATAR_SHAPES,
  DEFAULT_THEME,
  FONTS,
  SECTIONS,
  THEME_VERSION,
  bgLayerStyle,
  cursorValue,
  resolveTheme,
  themeToVars,
} from "../../lib/profile/theme.ts";
import { saveTheme, themeFor } from "../../lib/profile/store.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { eq as sqlEq } from "drizzle-orm";

// ── D21 · the sections are v3's ─────────────────────────────────────────────

test("the sections are v3's, and none of v1's deleted surfaces survived the port", async () => {
  const keys = SECTIONS.map((s) => s.key);
  eq(
    [...keys].sort(),
    ["accounts", "challenges", "rank", "standings", "trophies"],
    "linked accounts, trophy case, challenges entered, standings, rank history",
  );

  // The four that had to go, named individually. A general "the list changed"
  // assertion would pass on a list that quietly kept one of them.
  for (const gone of ["quests", "badges", "activity", "spaces"]) {
    no(
      keys.includes(gone as never),
      `“${gone}” names a surface v3 deleted and must not be a profile section`,
    );
  }

  // And a stored theme naming one cannot bring it back. This is the path that
  // mattered: a gamer's saved order is storage, and storage outlives a deploy.
  const resurrected = resolveTheme({
    order: ["quests", "trophies", "spaces"],
    sections: { quests: true, badges: true },
  });
  no(resurrected.order.includes("quests"), "a saved order naming a dead section drops it");
  no("quests" in resurrected.sections, "and so does a saved visibility map");
  ok(resurrected.order.includes("trophies"), "while everything real survives");
  eq(
    [...resurrected.order].sort(),
    [...keys].sort(),
    "and every current section is present, so hiding one is a choice rather than an accident",
  );
});

// ── D16/E18 · every field degrades ──────────────────────────────────────────

test("every field degrades on its own, and one bad value does not cost a gamer the rest", async () => {
  // ===== FIELD BY FIELD, NOT ALL OR NOTHING =====
  //
  // D16 — *"a missing value is never a broken page, and that is what makes the
  // engine safe to extend."* The tempting implementation validates the blob and
  // falls back to `DEFAULT_THEME` when anything is wrong, which means one
  // unreadable colour throws away everything somebody built.
  const t = resolveTheme({
    bg: "not-a-colour",
    accent: "#0e7490",
    radius: 9999,
    avatarSize: -40,
    font: "comic-sans-that-does-not-exist",
    avatarShape: "octagon",
    cardStyle: "hologram",
    bgOverlay: 500,
  });

  eq(t.bg, DEFAULT_THEME.bg, "a colour that is not a colour falls back");
  eq(t.accent, "#0e7490", "and the good colour beside it survives — that is the whole rule");
  eq(t.radius, 40, "a radius past the ceiling is clamped, not discarded");
  eq(t.avatarSize, 48, "and a negative size is clamped to the floor");
  eq(t.font, DEFAULT_THEME.font, "a font nobody loads falls back");
  eq(t.avatarShape, DEFAULT_THEME.avatarShape, "and so does a shape nobody can draw");
  eq(t.cardStyle, DEFAULT_THEME.cardStyle, "and a card style the CSS has never heard of");
  eq(t.bgOverlay, 90, "and an overlay past 90% is clamped");

  // Nothing at all is a whole valid theme, which is what a new gamer gets.
  const empty = resolveTheme(undefined);
  eq(empty.bg, DEFAULT_THEME.bg, "no theme is the default theme");
  eq(empty.order.length, SECTIONS.length, "with every section, in order");
  eq(empty.v, THEME_VERSION, "stamped with the version");

  // D20 — the stamp exists so the NEXT redesign can decide, not so this one can
  // discard. A blob from an older version keeps its values.
  const old = resolveTheme({ v: 0, accent: "#f43f5e", avatarShape: "star" });
  eq(old.accent, "#f43f5e", "a theme from an older schema keeps its accent");
  eq(old.avatarShape, "star", "and its shape — somebody picked that");
  eq(old.v, THEME_VERSION, "and is stamped with today's version on the way out");
});

test("nothing a gamer can type escapes into CSS", async () => {
  // ===== THE PROPERTY THAT MAKES A PUBLIC THEME SAFE =====
  //
  // Every one of these values ends up inside a CSS `url("…")` or a variable on
  // a page strangers visit. A quote closes the rule early and the rest is CSS
  // somebody else wrote; a `javascript:` scheme is somebody else's script. v1
  // accepted any string starting with `http`.
  const nasty = resolveTheme({
    bgImage: 'https://x/a.png"); } body { display:none } .x { background:url("',
    coverUrl: "javascript:alert(1)",
    cursor: "http://insecure.example/cur.png",
    accent: "red; background: url(evil)",
  });

  eq(nasty.bgImage, null, "a background URL carrying a quote is refused outright");
  eq(nasty.coverUrl, null, "and a javascript: scheme is not a URL");
  eq(nasty.cursor, DEFAULT_THEME.cursor, "and a plain-http custom cursor falls back");
  eq(nasty.accent, DEFAULT_THEME.accent, "and a colour that is a CSS rule is not a colour");

  // Which means the styles built from them carry nothing either.
  const style = JSON.stringify(bgLayerStyle(nasty)) + JSON.stringify(themeToVars(nasty));
  no(style.includes("display:none"), "nothing of the payload reaches the rendered style");
  no(/javascript:/i.test(style), "and no script scheme does");

  // The negative half: a legitimate image still works. A sanitiser that
  // refused everything would pass every assertion above.
  const fine = resolveTheme({ bgImage: "/uploads/abc.png", coverUrl: "https://cdn.test/c.png" });
  eq(fine.bgImage, "/uploads/abc.png", "a real upload path is kept");
  eq(fine.coverUrl, "https://cdn.test/c.png", "and a real https URL is kept");
  ok(
    JSON.stringify(bgLayerStyle(fine)).includes("/uploads/abc.png"),
    "and it reaches the background layer",
  );
});

// ── D17 · scoped, and guarded by breaking ───────────────────────────────────

test("a gamer's theme cannot leak into Cluster's own chrome", async () => {
  // ===== D17/E17, AND WHY IT IS ASSERTED THREE WAYS =====
  //
  // *"A gamer's choices can never leak into Cluster's own chrome."* The leak
  // would not look like a bug on their page — it would look like the nav, the
  // money colour and the podium changing for every visitor who happened to
  // land on a profile next.
  //
  // Three properties, because there are three ways it could happen: a variable
  // name that is not scoped by prefix, a stylesheet rule that is not scoped by
  // selector, and a page that writes a `<style>` tag.
  const vars = themeToVars(resolveTheme({ accent: "#ff0000" }));
  const leaked = Object.keys(vars).filter((k) => k.startsWith("--") && !k.startsWith("--p-"));
  eq(leaked, [], "every custom property the theme sets is prefixed --p-");
  ok(Object.keys(vars).includes("--p-accent"), "and it really does set some — an empty answer proves nothing");

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const css = await fs.readFile(path.join(repoRoot, "app/globals.css"), "utf8");
  const themeLayer = css.slice(css.indexOf(".profile-root"));
  const unscoped = themeLayer
    .split("\n")
    .filter((l) => /^[.:#a-z\[]/i.test(l.trim()) && l.includes("{"))
    .filter((l) => !l.includes(".profile-root"))
    .map((l) => l.trim());
  eq(unscoped, [], "every rule in the theme layer is scoped to .profile-root");
  ok(themeLayer.includes("--p-bg"), "and the layer really is the theme layer");

  // The podium is Cluster's, on every profile. 13-DESIGN §1: a colour used for
  // two things is worth less than a colour used for one, and gold means the
  // podium — so it is not a `--p-` variable and a gamer cannot repaint it.
  ok(themeLayer.includes(".p-gold"), "the podium colours exist in the scope");
  no(
    /--p-gold|--p-silver|--p-bronze/.test(themeLayer),
    "and none of them is gamer-settable — a meaning is not a theme",
  );

  // Comments stripped, the lesson `94-reachability` and `97-copy-rule` both
  // learned: this file explains at its top that nothing writes a style tag,
  // and reading raw source flagged the explanation.
  const { withoutComments } = await import("../helpers/source.ts");
  const view = withoutComments(
    await fs.readFile(path.join(repoRoot, "app/u/[slug]/profile-view.tsx"), "utf8"),
  );
  no(/<style/.test(view), "and the page writes no style tag, so there is nothing to escape from");
  ok(/ProfileView/.test(view), "and the read found the real component");
});

// ── D18 · the background is a separate fixed layer ──────────────────────────

test("the background never uses background-attachment: fixed", async () => {
  // v1 measured this: on a long, heavily-customized profile `fixed` forces a
  // full-viewport repaint on every scroll frame, which is the "slow scrolling"
  // gamers reported. A `position: fixed` element behind the content looks
  // identical and the compositor handles it.
  const style = JSON.stringify(bgLayerStyle(resolveTheme({ bgImage: "/a.png" })));
  no(/attachment/i.test(style), "the background style sets no attachment at all");

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");
  const { withoutComments } = await import("../helpers/source.ts");
  const view = withoutComments(
    await fs.readFile(path.join(repoRoot, "app/u/[slug]/profile-view.tsx"), "utf8"),
  );
  no(/backgroundAttachment|background-attachment/.test(view), "and neither does the page");
  ok(/fixed inset-0/.test(view), "which renders its own fixed layer instead");
  ok(/pointer-events-none/.test(view), "that can never take a click");
});

// ── E19 · the builder previews their actual page ────────────────────────────

test("the builder previews the same component the public page renders", async () => {
  // E19 — *"the builder shows a live preview of their own page, not an
  // abstract form."* Asserted structurally, for the reason E8's card preview
  // is: a second implementation agrees with the page until the day it does
  // not, and that is the day somebody publishes something they never saw.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const builder = await fs.readFile(path.join(repoRoot, "app/settings/profile/page.tsx"), "utf8");
  ok(
    /from\s+["'][^"']*u\/\[slug\]\/profile-view\.tsx["']/.test(builder),
    "the builder imports the public page's own view",
  );
  ok(/<ProfileView/.test(builder), "and renders it");
  ok(/profileBySlug\(/.test(builder), "with their real profile data, not a fixture");

  const page = await fs.readFile(path.join(repoRoot, "app/u/[slug]/page.tsx"), "utf8");
  ok(/<ProfileView/.test(page), "and the public page renders the same one");
});

// ── The store ───────────────────────────────────────────────────────────────

test("a theme survives a round trip, and an unreadable one is still a page", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Themed" });

  const saved = await saveTheme(db, userId, {
    accent: "#22d3ee",
    avatarShape: "hexagon",
    cardStyle: "outline",
    sections: { standings: false },
    order: ["trophies", "accounts"],
  });
  eq(saved.accent, "#22d3ee", "what was saved is what comes back");

  const read = await themeFor(db, userId);
  eq(read.accent, "#22d3ee", "and reading it again agrees");
  eq(read.avatarShape, "hexagon", "shape and all");
  eq(read.sections.standings, false, "a hidden section stays hidden");
  eq(read.order[0], "trophies", "and their order is theirs");
  eq(
    read.order.length,
    SECTIONS.length,
    "with the sections they did not name appended rather than lost",
  );

  // ===== AND A ROW OF NONSENSE IS STILL A PAGE =====
  //
  // The failure this prevents is a gamer's page 500ing because of a value in a
  // column, on a public URL, with no way for them to fix it.
  await db
    .update(schema.profileThemes)
    .set({ theme: { accent: 12, order: "not-an-array", sections: null } as never })
    .where(sqlEq(schema.profileThemes.userId, userId));
  const salvaged = await themeFor(db, userId);
  eq(salvaged.accent, DEFAULT_THEME.accent, "a nonsense row reads as the default");
  eq(salvaged.order.length, SECTIONS.length, "with every section present");

  // A gamer with no row at all is the ordinary case, and it is a whole theme.
  const other = await createGamer(db, { displayName: "Unthemed" });
  const fresh = await themeFor(db, other);
  eq(fresh.accent, DEFAULT_THEME.accent, "a gamer who has never opened the builder has a theme");
});

test("the fonts and cursors a gamer can pick all resolve to something real", async () => {
  // README change 5, and trap 31: `--font-grotesk` named a font v3 does not
  // load, so every gamer who picked it silently got system sans. A default
  // that looks like a decision is the failure — so no stack may point at a
  // variable nobody defines.
  for (const [key, stack] of Object.entries(FONTS)) {
    no(
      /var\(--font-/.test(stack),
      `the “${key}” font stack names a CSS variable — v3 loads no such font, and the fallback looks like a choice`,
    );
    ok(stack.includes(","), `and “${key}” has a fallback after its first face`);
  }

  // Every avatar shape draws: three by radius, four by clip-path.
  const { avatarClip } = await import("../../lib/profile/theme.ts");
  for (const shape of AVATAR_SHAPES) {
    const byRadius = ["circle", "rounded", "square"].includes(shape);
    ok(
      byRadius || avatarClip(shape) !== undefined,
      `“${shape}” has a clip-path, or it is one of the three drawn by radius`,
    );
  }

  // And a cursor is a cursor, never an unquoted string in a CSS rule.
  ok(cursorValue("default") === "auto", "the default cursor is the browser's");
  ok(/^url\("data:image\/svg/.test(cursorValue("spark", "#22d3ee")), "a preset is a data URI");
  eq(cursorValue('spark", x'), "auto", "and a key nobody knows is not interpolated at all");
});
