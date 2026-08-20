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
  const defaults = { tagline: COPY.tagline };

  await saveOverride(db, { scope: "copy", key: "tagline", value: "An override.", editedBy: "u1" });
  eq((await liveCopy(db, defaults)).tagline, "An override.", "the override reads");

  await saveOverride(db, { scope: "copy", key: "tagline", value: null, editedBy: "u1" });
  eq(
    (await liveCopy(db, defaults)).tagline,
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
  eq((await liveCopy(db, defaults)).tagline, "", "an override to blank is an override to blank");
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
