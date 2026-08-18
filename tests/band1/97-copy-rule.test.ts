// Copy states the current rule. 09-TEST-PLAN's band, 07 N3/N4, 02 K13.
//
// ===== THE SENTENCE OUTLIVED THE RULE, ON THE PUBLIC HOMEPAGE =====
//
// For a whole sprint `lib/content/copy.ts` and `lib/portal/owner.ts` both said:
//
//     "A gamer in two servers is worth half to each"
//
// That is the ½-across-all-servers model **Sprint 5 deleted**. It was on the
// homepage explaining how servers get paid, and in the owner portal explaining
// a KPI. Every *figure* around it was correctly imported — house rule 2 held
// perfectly — so the copy guard passed, the money guards passed, and the
// sentence said nothing false about a number and nothing true about the rule.
//
// N3 is the generalisation: **a sentence that states a rule is generated from
// the module that enforces the rule, never typed.** Rule 2 covers the numbers;
// this covers the sentence around them, and the sentence is what a rule change
// leaves behind.
//
// ===== WHY THE THIRD CLAUSE IS THE WHOLE TEST =====
//
// K13 requires the sentence to name three things: the parent server credited
// for acquisition, the join server credited for conversion, and **1.0 when
// they are the same server, not two halves**. A retyped sentence always drops
// that third case — dropping it is precisely what made the old wording sound
// almost right — so it is asserted on its own below rather than folded into a
// general "does it mention attribution" check.

import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { withoutComments, walkSource } from "../helpers/source.ts";
import fs from "node:fs/promises";
import path from "node:path";
import {
  entrantCredit,
  attributionSentence,
  attributionShort,
} from "../../lib/identity/attribution.ts";

const repoRoot = path.join(import.meta.dirname, "..", "..");

/** Where product copy can live. Not `tests/` — a guard may quote what it bans. */
const PRODUCT = ["app", "lib"];

/** The module that owns the rule, and therefore owns its words. */
const OWNER = path.join("lib", "identity", "attribution.ts");

async function productSources(): Promise<{ rel: string; src: string }[]> {
  const files: { rel: string; src: string }[] = [];
  for (const dir of PRODUCT) {
    for (const abs of await walkSource(path.join(repoRoot, dir))) {
      files.push({
        rel: path.relative(repoRoot, abs),
        // Comments stripped: a comment may explain that a rule was deleted,
        // rendered copy may not state it. Both call sites carry exactly such a
        // comment, quoting the dead sentence so the next reader knows why the
        // import is there.
        src: withoutComments(await fs.readFile(abs, "utf8")),
      });
    }
  }
  return files;
}

test("the deleted model's sentence appears nowhere in the product", async () => {
  // The banned phrase is 09-TEST-PLAN's own: it names no parent, no join
  // server, and not the same-server case.
  const BANNED = /in two servers is worth half to each/i;

  const offenders = (await productSources())
    .filter((f) => BANNED.test(f.src))
    .map((f) => f.rel);

  eq(
    offenders.join(", "),
    "",
    "no page describes attribution in the words of the model Sprint 5 deleted",
  );
});

test("nothing outside the attribution module types the rule in words", async () => {
  // ===== THE 94-surface-reach SHAPE: WALK THE TREE, NOT A LIST =====
  //
  // Banning one phrase only bans the phrase somebody already found. What N3
  // actually requires is that the *words the module produces* are produced by
  // the module — so any file that spells them out itself is retyping, whatever
  // wording it chose.
  //
  // The phrases are taken from `attributionSentence` and `attributionShort`
  // rather than typed here, so a change to how the rule is worded cannot leave
  // this guard checking for something nobody says any more.
  const generated = `${attributionSentence()} ${attributionShort()}`;
  const PHRASES = [
    "half an entrant",
    "a whole entrant",
    "worth half",
    "half to each",
    "½ to each",
  ];
  for (const phrase of PHRASES.slice(0, 2)) {
    ok(
      generated.includes(phrase),
      `"${phrase}" is a phrase the module actually produces — otherwise this ` +
        `guard is checking for words nobody says`,
    );
  }

  const offenders: string[] = [];
  for (const f of await productSources()) {
    if (f.rel === OWNER) continue;
    for (const phrase of PHRASES) {
      if (f.src.toLowerCase().includes(phrase.toLowerCase())) {
        offenders.push(`${f.rel} (“${phrase}”)`);
      }
    }
  }

  eq(
    offenders.join(", "),
    "",
    "attribution is described only by the module that enforces it. Every other " +
      "file imports the sentence — retyping it is the defect one level up from " +
      "retyping a number",
  );
});

test("the sentence names all three cases, and the third is the one that matters", async () => {
  const full = attributionSentence();
  const short = attributionShort();

  for (const [label, text] of [["full", full], ["short", short]] as const) {
    ok(/parent/i.test(text), `the ${label} sentence names the parent server (acquisition)`);
    ok(
      /entered from|join/i.test(text),
      `the ${label} sentence names the server they entered from (conversion)`,
    );
    // K13's third thing. Asserted separately and by its meaning, not by
    // matching a word, because "1.0 when they are the same" is the clause a
    // retyped sentence drops.
    ok(
      /same server/i.test(text),
      `the ${label} sentence names the case where both are the SAME server`,
    );
  }

  ok(
    /not two halves/i.test(full),
    "and the full sentence says plainly that it is not two halves — the thing " +
      "somebody would otherwise assume from the first clause",
  );
  ok(/acquisition/i.test(full), "the full sentence says what the parent is credited FOR");
  ok(/conversion/i.test(full), "and what the join server is credited for");
});

test("the sentence is produced by the rule, so changing the rule changes it", async () => {
  // ===== THIS IS THE ASSERTION THAT MAKES THE OTHERS WORTH HAVING =====
  //
  // Every test above would still pass against a beautifully-worded literal.
  // What N3 requires is that the words come from `entrantCredit`, so the
  // shares are recomputed here — independently, from the same function the
  // pool reads — and the sentence must contain what that function returns.
  //
  // Replace the generated call with a literal and this goes red the moment the
  // split changes, which is exactly when the old sentence went wrong.
  const split = entrantCredit({ parentGuildId: "p", joinGuildId: "j" });
  const together = entrantCredit({ parentGuildId: "p", joinGuildId: "p" });

  eq(split.length, 2, "the split case credits two servers");
  eq(together.length, 1, "and the same-server case credits ONE, not two halves");

  const words = (share: number) =>
    share === 1
      ? "a whole entrant"
      : share === 0.5
        ? "half an entrant"
        : `${Number((share * 100).toFixed(2))}% of an entrant`;

  const full = attributionSentence();
  for (const credit of split) {
    ok(
      full.includes(words(credit.share)),
      `the sentence states the share the rule actually returns (${credit.share})`,
    );
  }
  ok(
    full.includes(words(together[0].share)),
    `and the same-server share the rule actually returns (${together[0].share})`,
  );

  // The two halves sum to one whole entrant. If that ever stops being true the
  // sentence is describing a split that loses or invents an entrant.
  eq(
    split.reduce((sum, c) => sum + c.share, 0),
    together[0].share,
    "the split and the same-server case credit the same total — one entrant",
  );
});

test("both places that used the stale sentence now import it", async () => {
  // Named directly. These are the two files N4 records, and a guard that only
  // checked the general rule would go green if somebody deleted the sentence
  // from a page rather than fixing it.
  for (const rel of ["lib/content/copy.ts", "lib/portal/owner.ts"]) {
    const src = withoutComments(await fs.readFile(path.join(repoRoot, rel), "utf8"));
    ok(
      /attributionShort\(\)|attributionSentence\(\)/.test(src),
      `${rel} takes the sentence from the attribution module`,
    );
    ok(
      /from "\.\.\/identity\/attribution\.ts"/.test(src),
      `${rel} imports it from the module that owns the rule`,
    );
  }
});
