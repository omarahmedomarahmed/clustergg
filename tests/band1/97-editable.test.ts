// What a human can change without a deploy. `docs/14-EDITABLE.md` E1–E7.
//
// ===== THE REFUSAL IS TESTED BEFORE THE EDITOR IT PROTECTS =====
//
// §1: *"The moment an operator can type copy, the guard that stops a page
// retyping a figure stops covering anything."* Both existing copy guards —
// `03-copy` and `97-copy-rule` — walk **source files**. They can only see
// strings a deploy put there, so the day the store goes live they are guarding
// a set of strings nobody renders any more.
//
// This is not hypothetical. It is the failure this branch was created after: a
// document quoting an owner's withdrawal floor at twice its real value. It was
// not lying — it was a copy of a number that had moved.
//
// ===== THE NEGATIVE HALF IS THE FIRST TEST, ON PURPOSE =====
//
// A validator whose body is `return refuse()` passes E1, E2, E3 and E4. So the
// first case here is the one that fails against it, and everything after it is
// only meaningful because that case passes.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { checkCopy, refusalText } from "../../lib/content/validate.ts";
import {
  saveOverride,
  currentOverrides,
  historyOf,
  liveCopy,
  CopyRefused,
} from "../../lib/content/store.ts";
import { COPY, SAYS } from "../../lib/content/copy.ts";
import { CHALLENGE_PRICE_CENTS, formatMoney } from "../../lib/money/amounts.ts";
import { attributionShort } from "../../lib/identity/attribution.ts";
import { eq as sqlEq } from "drizzle-orm";

// ── The negative half ───────────────────────────────────────────────────────

test("a legitimate sentence is accepted, including one with a placeholder", async () => {
  // ===== WITHOUT THIS, EVERY OTHER TEST IN THIS FILE IS SATISFIED BY `no` ====
  //
  // A validator that refuses everything enforces E1, names an alternative for
  // E2, catches every rule for E3 and never writes a bad row for E4. It is
  // also useless, and an editor nobody can use is an editor that gets bypassed
  // — the operator writes the figure into a page instead, which is where it
  // was in the first place.
  const fine = [
    ["tagline", COPY.tagline],
    ["noMachinery", COPY.noMachinery],
    ["gracePeriod", COPY.gracePeriod],
    ["poolIsPublic", COPY.poolIsPublic],
    // The shape copy is *meant* to take: a sentence with a hole, which SAYS
    // fills from the module that enforces the figure.
    ["unitPrice", "One challenge, one game, one week: {price}, billed individually."],
    ["prizeLine", "A {price} challenge buys a {prize} prize pool."],
    // Numbers that are not figures the product decides. A validator that
    // cannot tell a clock from a floor refuses the whole site.
    ["week", "The week runs Monday 00:00 UTC to Friday 00:00 UTC."],
    ["oneGame", "One game, one week. You play the game you were going to play anyway."],
  ] as const;

  const refused: string[] = [];
  for (const [key, value] of fine) {
    if (!checkCopy(key, value).ok) refused.push(`${key}: ${value}`);
  }
  eq(
    refused,
    [],
    "every default this platform already ships is savable — a refusal that " +
      "cannot be satisfied is a refusal that gets routed around",
  );
});

// ── E1 · the refusal ────────────────────────────────────────────────────────

test("a currency amount, a percentage and a threshold are each refused at save", async () => {
  const price = formatMoney(CHALLENGE_PRICE_CENTS);

  const money = checkCopy("tagline", `Every challenge costs ${price}.`);
  no(money.ok, "a price is refused");
  eq(money.ok ? "" : money.rule, "currency", "as a currency amount");

  const typo = checkCopy("tagline", "Every challenge costs $700.");
  no(typo.ok, "and so is a WRONG price, which is the case that matters");
  eq(typo.ok ? "" : typo.rule, "currency", "still a currency amount");

  const share = checkCopy("split", "Half the money, 50%, goes to the prize pool.");
  no(share.ok, "a percentage is refused");
  eq(share.ok ? "" : share.rule, "percentage", "as a percentage");

  const floor = checkCopy("withdraw", "You can withdraw at any time over 20 dollars.");
  no(floor.ok, "a withdrawal floor is refused");

  const gate = checkCopy("pool", "Your server needs at least 10 linked members.");
  no(gate.ok, "and so is a threshold");
  eq(gate.ok ? "" : gate.rule, "threshold", "as a threshold");
});

test("the refusal names the exact key that already carries that figure", async () => {
  // E1's second half. Typing the challenge price is not a generic mistake — it
  // is a copy of `CHALLENGE_PRICE_CENTS`, and saying which key already holds it
  // is what makes the refusal actionable.
  const check = checkCopy("tagline", `A challenge is ${formatMoney(CHALLENGE_PRICE_CENTS)}.`);
  no(check.ok, "refused");
  const text = refusalText(check)!;
  ok(/challenge price/.test(text), "the refusal says which figure it is");
  ok(/CHALLENGE_PRICE_CENTS/.test(text), "and names the module constant that holds it");
  ok(/\{price\}/.test(text), "and the placeholder to use instead");
});

test("the refusal always names an alternative", async () => {
  // E2 — *"a refusal that only says no gets worked around."* Asserted for
  // every rule rather than for one, because the rule somebody hits is the one
  // whose message nobody checked.
  const cases = [
    ["price", "It costs $99."],
    ["share", "We keep 25%."],
    ["gate", "You need at least 3 wins."],
    ["attribution", "A gamer in two servers is worth half to each."],
  ] as const;

  const silent: string[] = [];
  for (const [key, value] of cases) {
    const check = checkCopy(key, value);
    if (check.ok) {
      silent.push(`${key} was not refused at all`);
      continue;
    }
    if (!check.alternative || check.alternative.length < 20) {
      silent.push(`${key} refused without saying what to write instead`);
    }
  }
  eq(silent, [], "every refusal carries the alternative, in words an operator can act on");
});

// ── E3 · a rule stated in words ─────────────────────────────────────────────

test("a rule stated in words is refused, in the words the module produces", async () => {
  // E3/N3. Rule 2 covers the numbers; this covers the sentence around them,
  // and the sentence is what a rule change leaves behind. `lib/content/copy.ts`
  // and `lib/portal/owner.ts` both carried *"a gamer in two servers is worth
  // half to each"* for a whole sprint — the model Sprint 5 deleted, on the
  // public homepage, beside figures that were all correctly imported.
  const deleted = checkCopy("kpis", "A gamer in two servers is worth half to each.");
  no(deleted.ok, "the deleted model's own sentence is refused");
  eq(deleted.ok ? "" : deleted.rule, "rule-in-words", "as a rule stated in words");

  const paraphrase = checkCopy("kpis", "An entrant counts half to each server they belong to.");
  no(paraphrase.ok, "and so is a paraphrase of it");

  // And the current rule, typed out, is refused for the same reason — being
  // right today is not the property. An operator may not type it any more than
  // a component may, because the next change leaves their copy behind.
  const current = checkCopy("kpis", attributionShort());
  no(current.ok, "including the CURRENT rule typed by hand, which is the subtler half");
});

test("the phrases this checks for are ones the module actually produces", async () => {
  // The canary `97-copy-rule` learned the hard way: a guard checking for words
  // nobody says any more is decoration. If the attribution rule is reworded,
  // this fails and somebody re-reads which phrases are "the module's words".
  const generated = attributionShort().toLowerCase();
  ok(
    /entrant/.test(generated) && /parent/.test(generated),
    "the module still describes an entrant and a parent server",
  );
  const refused = checkCopy("kpis", "worth half to each");
  no(refused.ok, "and the phrase list still catches the deleted model's wording");
});

// ── E4 · every edit is a new row ────────────────────────────────────────────

test("every edit is a new row with who and when, and the previous value survives", async () => {
  const db = await resetDemoDb();

  await saveOverride(db, { scope: "copy", key: "tagline", value: "First wording.", editedBy: "u1" });
  await saveOverride(db, { scope: "copy", key: "tagline", value: "Second wording.", editedBy: "u2" });

  const rows = await db
    .select()
    .from(schema.contentOverrides)
    .where(sqlEq(schema.contentOverrides.key, "tagline"));
  eq(rows.length, 2, "two edits, two rows — nothing was overwritten");

  const history = await historyOf(db, "copy", "tagline");
  eq(history[0].value, "Second wording.", "the newest is first");
  eq(history[0].editedBy, "u2", "with who made it");
  ok(history[0].editedAt instanceof Date, "and when");
  eq(history[1].value, "First wording.", "and the previous value is one click away");

  const live = await currentOverrides(db, "copy");
  eq(live.get("tagline")?.value, "Second wording.", "the live value is the newest row");
});

test("deleting an override is a row, and the key reads as its default again", async () => {
  // E6 — *"deleting an override is a first-class action, not an edit to
  // blank."* A store that could not tell the two apart would make the default
  // unreachable the moment anybody typed into the key.
  const db = await resetDemoDb();

  await saveOverride(db, { scope: "copy", key: "tagline", value: "An override.", editedBy: "u1" });
  eq((await liveCopy()).tagline, "An override.", "the override reads");

  await saveOverride(db, { scope: "copy", key: "tagline", value: null, editedBy: "u1" });
  eq(
    (await liveCopy()).tagline,
    COPY.tagline,
    "removing it reads as the code-side default again",
  );
  eq(
    (await historyOf(db, "copy", "tagline")).length,
    2,
    "and the removal is itself a row, so the history says how it got back",
  );

  // A blank string is a different thing and stays one.
  await saveOverride(db, { scope: "copy", key: "tagline", value: "", editedBy: "u1" });
  eq((await liveCopy()).tagline, "", "an override to blank is an override to blank");
});

// ── The refusal is at the store, not at the form ────────────────────────────

test("the store refuses a figure, so a form is not the only thing standing in the way", async () => {
  // The same reasoning `app/redeem/actions.ts` gives about the $0 refusal:
  // hiding a control satisfies a reader of the screen and nobody else. A form
  // post is a string, and a rule that only a template knows is a rule until
  // somebody posts to the endpoint.
  const db = await resetDemoDb();

  await throws(
    () =>
      saveOverride(db, {
        scope: "copy",
        key: "tagline",
        value: "Every challenge costs $700.",
        editedBy: "u1",
      }),
    /set in one place|carries no figures/,
    "the write itself refuses, not merely the editor in front of it",
  );

  eq(
    (await db.select().from(schema.contentOverrides)).length,
    0,
    "and nothing was written — a refusal that saves first is not a refusal",
  );

  // An unattributed edit is refused too: E4 wants who, and "who" cannot be
  // supplied later.
  await throws(
    () => saveOverride(db, { scope: "copy", key: "tagline", value: "Fine.", editedBy: "" }),
    /recorded against the person/,
    "and an edit with no author is refused",
  );
});

test("SAYS keys still produce their figures, so the refusal has an answer to point at", async () => {
  // E5 — the two halves are different things: `COPY` can hold no figure at
  // all, and `SAYS` sentences take one. The refusal tells an operator to use
  // SAYS, so SAYS has to actually work — otherwise the alternative is advice
  // to write something that does not exist.
  const line = SAYS.unitPrice();
  ok(
    line.includes(formatMoney(CHALLENGE_PRICE_CENTS)),
    "SAYS.unitPrice carries the real price, taken from the module",
  );
  no(
    checkCopy("unitPrice", "One challenge, one game, one week: {price}, billed individually.").ok ===
      false,
    "and the placeholder form of the same sentence is savable",
  );
});

test("an edit is live on the page that renders it, without a deploy", async () => {
  // ===== E7 — AND THE HALF AN EDITOR ALONE DOES NOT GIVE YOU =====
  //
  // An editor that writes rows nobody reads is a diagnostic with a text box.
  // The property is that the **page** changes, so this asserts through
  // `liveCopy` — the function `app/page.tsx` and `app/pool/page.tsx` call —
  // rather than through the store it happens to read.
  const db = await resetDemoDb();
  eq((await liveCopy()).poolIsPublic, COPY.poolIsPublic, "it starts as the default");

  await saveOverride(db, {
    scope: "copy",
    key: "poolIsPublic",
    value: "Every server's earnings are public, on purpose.",
    editedBy: "u1",
  });
  eq(
    (await liveCopy()).poolIsPublic,
    "Every server's earnings are public, on purpose.",
    "and the next render says the new thing — no deploy in this loop",
  );

  // An override for a key the deploy has since removed is history, not copy.
  // Rendering it would resurrect a string somebody deliberately deleted.
  await saveOverride(db, { scope: "copy", key: "keyThatWasDeleted", value: "Gone.", editedBy: "u1" });
  const rendered = await liveCopy();
  no("keyThatWasDeleted" in rendered, "an override with no key behind it renders nothing");
});

// ── E8–E12 · the card editor ────────────────────────────────────────────────

test("the preview and the card are drawn by the same function", async () => {
  // ===== E8, AND WHY IT IS ASSERTED STRUCTURALLY =====
  //
  // *"The preview is rendered by the same code that renders the card — a real
  // image, never an HTML mock. Two renderers is how a preview starts lying."*
  //
  // This platform has paid for the alternative already: `loadCardFonts()`
  // returned `[]`, `ImageResponse` throws on an empty font list, **every card
  // on the platform threw**, the fence turned them all into text, and both
  // bands stayed green. An HTML preview would have looked perfect throughout.
  //
  // So the property is "there is exactly one renderer", and it is read from
  // source: a second one that agreed with the first today is still a second
  // one tomorrow.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const preview = await fs.readFile(
    path.join(repoRoot, "app/api/admin/card-preview/route.ts"),
    "utf8",
  );
  ok(
    /from\s+["'][^"']*lib\/cards\/render\.ts["']/.test(preview),
    "the preview route imports the real renderer",
  );
  ok(/renderCard\(/.test(preview), "and calls it");
  ok(
    /from\s+["'][^"']*lib\/cards\/sample\.ts["']/.test(preview),
    "with the same sample the save check renders",
  );

  // And nothing anywhere builds a card out of markup instead.
  const { walkSource, withoutComments } = await import("../helpers/source.ts");
  const drawnInHtml: string[] = [];
  for (const abs of await walkSource(path.join(repoRoot, "app"))) {
    // Comments stripped, for the reason `94-reachability` learned: a file
    // explaining that a card is 1200×630 is explaining, not drawing.
    // `/api/uploads` says exactly that, and reading raw source flagged it.
    const src = withoutComments(await fs.readFile(abs, "utf8"));
    const rel = path.relative(repoRoot, abs);
    if (/card-?preview/i.test(rel)) continue;
    // A page that both mentions a card and draws its own 1200×630 box is a
    // page drawing a card by hand.
    if (/1200/.test(src) && /630/.test(src) && /card/i.test(src)) drawnInHtml.push(rel);
  }
  eq(drawnInHtml, [], "and no page draws a card-shaped thing of its own");
});

test("a layout the renderer cannot draw degrades rather than throwing", async () => {
  // D20's rule applied to card settings: *read forgivingly, never discard on a
  // version mismatch.* A settings blob written by a deploy that had a layout
  // this one does not must not throw the family back to nothing — the
  // operator's accent survives a layout that did not.
  const { readSettings, CARD_DEFAULTS } = await import("../../lib/cards/settings.ts");

  const stale = readSettings({ layout: "carousel", accent: "#22d3ee", backgroundUrl: "/a.png" });
  eq(stale.layout, CARD_DEFAULTS.layout, "an unknown layout falls back to the default");
  eq(stale.accent, "#22d3ee", "and everything else survives — field by field, not all or nothing");

  eq(readSettings(null).layout, CARD_DEFAULTS.layout, "and no settings at all is the default");
  eq(readSettings({ accent: "red" }).accent, null, "a colour that is not a colour is dropped");
});

test("a family's settings reach the card without the spec knowing they exist", async () => {
  const { withSettings } = await import("../../lib/cards/settings.ts");
  const { sampleSpec } = await import("../../lib/cards/sample.ts");

  const applied = withSettings(sampleSpec("home"), {
    backgroundUrl: "/art.png",
    accent: "#0e7490",
    layout: "banner",
  });
  eq(applied.layout, "banner", "the layout reaches the renderer");
  eq(applied.accent, "#0e7490", "and the accent");
  eq(applied.imageUrl, "/art.png", "and the art");

  // ===== A MEANING IS NOT A THEME =====
  //
  // 13-DESIGN §1: gold, silver and bronze mean the podium and nothing else. A
  // spec that set its own accent said something; an operator recolouring the
  // family must not repaint it.
  const podium = withSettings({ title: "First", accent: "#fbbf24" }, {
    backgroundUrl: null,
    accent: "#0e7490",
    layout: "standard",
  });
  eq(podium.accent, "#fbbf24", "a spec that named its own accent keeps it");
});

test("S8 is not a layout property — nothing here can make an admin card public", async () => {
  // E12. The settings a human can edit are art, colour and arrangement. A
  // per-family "public" toggle would be a way to publish a server's earnings to
  // its whole membership by ticking a box on an admin page, so there is no such
  // field and this is what stops one being added quietly.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");
  const { withoutComments } = await import("../helpers/source.ts");

  const settings = withoutComments(
    await fs.readFile(path.join(repoRoot, "lib/cards/settings.ts"), "utf8"),
  );
  const action = withoutComments(
    await fs.readFile(path.join(repoRoot, "app/admin/cards/actions.ts"), "utf8"),
  );

  for (const [name, src] of [["settings", settings], ["the editor's action", action]] as const) {
    no(
      /\bephemeral\b/i.test(src),
      `${name} has no ephemeral field — S8 is decided by ADMIN_SCREENS, not by an editor`,
    );
    no(/\bpublic\b\s*[:?]/i.test(src), `${name} has no public flag either`);
  }

  // The canary: the read found the real files, so an empty answer is "no such
  // field" rather than "no such file".
  ok(/CARD_LAYOUTS/.test(settings), "the settings module was actually read");
  ok(/saveCardAction/.test(action), "and so was the action");
});

// ── E13–E16 · page background art ───────────────────────────────────────────

test("a page with no art renders nothing extra, and one with art carries its overlay", async () => {
  // E13 — *"always optional. Every page must look finished with none."* So
  // "none" is the absence of an element rather than an empty one: a page with
  // no art must not be a page with a transparent layer over it, or every
  // future z-index question starts with a thing nobody meant to be there.
  const db = await resetDemoDb();
  const { pageArtFor, NO_ART, MIN_OVERLAY, MAX_OVERLAY, readArt } = await import(
    "../../lib/site/page-art.ts"
  );

  const none = await pageArtFor(db, "home");
  eq(none.imageUrl, null, "with nothing saved, there is no image");

  await saveOverride(db, {
    scope: "page_art",
    key: "home",
    settings: { imageUrl: "/art.png", overlay: 60, focal: "top" },
    editedBy: "u1",
  });
  const set = await pageArtFor(db, "home");
  eq(set.imageUrl, "/art.png", "the art reads");
  eq(set.overlay, 60, "and its overlay, which travels with it");
  eq(set.focal, "top", "and its focal point");

  // E14 — the overlay is part of the setting and it has a floor. An operator
  // picking art on a calibrated monitor is the one person who cannot see the
  // phone in daylight that makes the words unreadable.
  eq(readArt({ imageUrl: "/a.png", overlay: 0 }).overlay, MIN_OVERLAY, "zero is clamped to the floor");
  eq(readArt({ imageUrl: "/a.png", overlay: 200 }).overlay, MAX_OVERLAY, "and 200 to the ceiling");
  eq(
    readArt({ imageUrl: "/a.png" }).overlay,
    NO_ART.overlay,
    "and art saved with no overlay at all still gets one",
  );

  // A page key that no page renders is not a page key.
  const { isPageKey } = await import("../../lib/site/page-art.ts");
  no(isPageKey("not-a-page"), "an unknown page key is refused");
  ok(isPageKey("pool"), "and a real one is not");
});

test("page art and card art go through the same upload door", async () => {
  // E16/E11 — *"the same upload door as everything else: acceptImage,
  // converted, stored in Blob."* A second upload path is a second place for
  // the WebP rule to be missing, and `10-SETUP` §8 is explicit that the
  // renderer cannot decode WebP: a WebP background is a silently broken card.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  for (const rel of [
    "app/admin/content/actions.ts",
    "app/admin/cards/actions.ts",
    "app/api/uploads/route.ts",
  ]) {
    const src = await fs.readFile(path.join(repoRoot, rel), "utf8");
    ok(/acceptImage\(/.test(src), `${rel} runs its upload through acceptImage`);
    ok(/putImage\(/.test(src), `${rel} stores it through putImage`);
  }

  // And the door still refuses what the renderer cannot draw.
  const { acceptImage, UploadRefused } = await import("../../lib/cards/upload.ts");
  let refusal: unknown;
  try {
    await acceptImage({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
  } catch (e) {
    refusal = e;
  }
  ok(refusal instanceof UploadRefused, "a WebP with no converter configured is refused");
  ok(
    /PNG and JPEG/.test((refusal as Error).message),
    "and the refusal says what the renderer can actually decode",
  );
});

test("a layout that cannot render is refused at save, not discovered by a gamer", async () => {
  // ===== E10, AND WHY THE FENCE MAKES IT NECESSARY =====
  //
  // `cardReply` fences `renderCard`: a family that throws produces a text card
  // with all its buttons and nothing anywhere complains. That fence is correct
  // and it stays — house rule 11 — but it means a broken layout is invisible
  // downstream, which is exactly what happened when `loadCardFonts()` returned
  // an empty list and **every card on the platform** turned into text for a
  // sprint with both bands green.
  //
  // So the save is the only place it can be caught, and the check there is
  // deliberately unfenced.
  const { assertLayoutRenders, LayoutRefused, CARD_DEFAULTS } = await import(
    "../../lib/cards/settings.ts"
  );

  let refusal: unknown;
  try {
    await assertLayoutRenders("home", CARD_DEFAULTS, async () => {
      throw new Error("No fonts are loaded. At least one font is required");
    });
  } catch (e) {
    refusal = e;
  }
  ok(refusal instanceof LayoutRefused, "a layout the renderer refuses is refused at save");
  ok(
    /No fonts are loaded/.test((refusal as Error).message),
    "carrying what the renderer actually said, which is the part somebody can fix",
  );
  ok(
    /not saved/.test((refusal as Error).message),
    "and saying it did not go live, because the fence downstream would hide that",
  );

  // The other half: a layout that renders is not refused. Without this, a
  // check that threw unconditionally would pass the case above.
  let secondThought: unknown;
  const drawn: unknown[] = [];
  try {
    await assertLayoutRenders("home", CARD_DEFAULTS, async (spec) => {
      drawn.push(spec);
      return { png: new Uint8Array() };
    });
  } catch (e) {
    secondThought = e;
  }
  eq(secondThought, undefined, "a layout that renders saves");
  eq(drawn.length, 1, "and the check rendered exactly one card to find that out");
  eq(
    (drawn[0] as { title?: string }).title,
    "ClusterGG",
    "a real sample spec, not an empty object — a layout that draws nothing renders fine",
  );
});

test("the card editor refuses through the rule, not through a copy of it", async () => {
  // The action must not decide this for itself. An action that re-implemented
  // the check is an action that can be kinder than the rule, and the next
  // surface that saves a layout would have to remember to decide the same way.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { withoutComments } = await import("../helpers/source.ts");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const action = withoutComments(
    await fs.readFile(path.join(repoRoot, "app/admin/cards/actions.ts"), "utf8"),
  );
  ok(/assertLayoutRenders\(/.test(action), "the save calls the rule");
  ok(/LayoutRefused/.test(action), "and carries its refusal back to the operator");
  ok(
    action.indexOf("assertLayoutRenders(") < action.indexOf("saveOverride("),
    "before the write, which is the whole of E10 — refused at save, not discovered by a gamer",
  );
});
