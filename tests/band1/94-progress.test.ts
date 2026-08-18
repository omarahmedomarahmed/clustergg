// Help and progress — 12 §11, and the one rule in it that is about money.
//
// ===== H4 IS NOT A STYLING PREFERENCE =====
//
//   H3 — "Progress bars on every gated thing: onboarding, server profile, pool
//        eligibility, challenge lifecycle."
//   H4 — "**Never** a progress bar on raw member count — that advertises the
//        wrong number to optimise."
//
// A bar is the most persuasive thing on a page: it says *this is the number,
// and you are this far along it*. Put one on a head count and every owner
// reads it as the instruction — which is the exact opposite of K3/K5, where a
// member who joins and never plays **lowers** the server's score.
//
// ===== WHY THE GUARD IS A CHOKEPOINT AND NOT A VOCABULARY =====
//
// The rule cannot be enforced inside the component: by the time a width
// arrives it is a number with no history, and `<Progress percent={87} />` looks
// identical whether 87 came from six profile fields or from 87 members. And a
// guard that greps for the word `memberCount` is trap 16 — it guards the
// vocabulary somebody happened to use.
//
// So there are two halves, and each catches what the other cannot:
//
//   1. **One place draws a bar.** Two components in `app/ui.tsx`, and a third
//      inline anywhere fails the band. A hand-rolled bar over a head count
//      cannot get in without tripping this.
//   2. **The pool bar counts the profile.** `poolEligibilityProgress` is handed
//      the whole reading — head count included — and must put none of it in the
//      bar. Handing it only the profile would make the rule impossible to break
//      *and impossible to prove*: the guard needs a function that could have
//      counted the head count and does not.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import {
  poolEligibilityProgress,
  profileProgress,
  unlockNote,
  lifecycleProgress,
  milestoneProgress,
  poolStandingHeadline,
} from "../../lib/site/progress.ts";
import {
  profileCompleteness,
  LINKED_MEMBERS_TO_UNLOCK_POOL,
  SERVER_PROFILE_FIELDS,
  type EligibilityReading,
} from "../../lib/pool/eligibility.ts";
import { STATES } from "../../lib/challenges/lifecycle.ts";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** A filled bar: a width driven by a value, inside a rounded track. */
const BAR = /style=\{\{\s*width:\s*`\$\{/;

/**
 * A reading with the two halves set independently, which is the whole point:
 * the interesting cases are the ones where they disagree.
 */
function reading(input: { fields: number; linked: number }): EligibilityReading {
  const guild: Record<string, string> = {};
  for (const f of SERVER_PROFILE_FIELDS.slice(0, input.fields)) guild[f.key] = "answered";
  const profile = profileCompleteness(guild);
  return {
    guildId: "g1",
    linkedMembers: input.linked,
    profile,
    eligible: profile.complete && input.linked >= LINKED_MEMBERS_TO_UNLOCK_POOL,
    reason: null,
  };
}

// ── H4 · the bar counts the profile, and the head count is prose ────────────

test("the pool bar counts profile fields and never the head count", async () => {
  // ===== CAN THIS FAIL? =====
  //
  // Yes, and in the shape the real mistake takes. A bar that folded the head
  // count in — `done = fields + linked`, `total = 6 + 10` — would read 76% on
  // the first case below instead of 0%, because those fifty members would be
  // doing the persuading. That is H4 exactly: the wrong number, advertised.
  const noProfileManyMembers = reading({ fields: 0, linked: 50 });
  const bar = poolEligibilityProgress(noProfileManyMembers);
  eq(bar.done, 0, "no profile field answered is no progress");
  eq(bar.percent, 0, "however many members are linked");
  eq(bar.total, SERVER_PROFILE_FIELDS.length, "the bar's denominator is the six fields");

  // And the other way round, which is the case 12 §5 writes out in words.
  const fullProfileNoMembers = reading({ fields: SERVER_PROFILE_FIELDS.length, linked: 0 });
  const full = poolEligibilityProgress(fullProfileNoMembers);
  eq(full.percent, 100, "a finished profile reads finished");
  no(
    fullProfileNoMembers.eligible,
    "and the server is still not eligible — the bar is not a proxy for the gate",
  );
});

test("the half that is not a bar is a sentence, and it names the gate", () => {
  // 12 §5: *"4 of 6 done · 6 more linked gamers to unlock the pool."* The head
  // count belongs in that second clause, and it has to actually say the number
  // — a bar somebody cannot act on is worse than no bar.
  const short = reading({ fields: 4, linked: 4 });
  eq(profileProgress(short.profile).label, "4 of 6 done", "the bar reads as 12 §5 writes it");

  const note = unlockNote(short);
  ok(note !== null, "and there is a note beside it");
  ok(
    note!.includes(String(LINKED_MEMBERS_TO_UNLOCK_POOL - short.linkedMembers)),
    `it names how many more are needed, not the threshold: ${note}`,
  );

  // Nothing to say once they are past it. "0 more linked gamers" is a true
  // sentence nobody wants to read.
  eq(
    unlockNote(reading({ fields: 6, linked: LINKED_MEMBERS_TO_UNLOCK_POOL })),
    null,
    "and it goes quiet once the gate is passed",
  );
});

test("E2's two states are four sentences, and the awkward one is right", () => {
  // The combination that matters is **in this week, not on track for next**.
  // E3 means this week is already safe; an owner shown only "not eligible"
  // would think they had lost money they have in fact already earned.
  const safe = poolStandingHeadline({ inThisWeeksPool: true, onTrackForNextWeek: false });
  ok(/this week is safe/i.test(safe), `it says this week is safe: ${safe}`);
  ok(/never/i.test(safe), "and why — eligibility is never re-checked mid-week");

  const four = new Set(
    [true, false].flatMap((a) =>
      [true, false].map((b) => poolStandingHeadline({ inThisWeeksPool: a, onTrackForNextWeek: b })),
    ),
  );
  eq(four.size, 4, "all four combinations say something different");
});

// ── H3 · a bar on each gated thing ──────────────────────────────────────────

test("the challenge lifecycle reads as a bar over its six states", () => {
  eq(lifecycleProgress("draft").done, 1, "draft is the first of six");
  eq(lifecycleProgress("ended").done, STATES.length, "and ended is all of them");
  eq(lifecycleProgress("ended").percent, 100, "a closed challenge is finished");
  eq(
    lifecycleProgress("announced").total,
    STATES.length,
    "the denominator is the lifecycle, read from the module that owns it",
  );

  // House rule 11 — a bar is decoration, and a decoration may never take a
  // page down. An unknown state reads as nothing done rather than throwing.
  eq(
    lifecycleProgress("not_a_state" as never).done,
    0,
    "an unknown state is a quiet zero, not an exception on a page path",
  );
});

test("a milestone bar counts what the gamer did, and caps at its target", () => {
  // T7/T13 — *"3 of 5 challenges in League"*. Every input is something they
  // did themselves, which is why this one is not an H4 problem at all.
  const m = milestoneProgress(3, 5, "challenges in League");
  eq(m.label, "3 of 5 challenges in League", "the words 03 §6 asks for");
  eq(milestoneProgress(9, 5, "weeks").percent, 100, "and an over-run does not read 180%");
});

// ── The chokepoint ──────────────────────────────────────────────────────────

test("exactly one file draws a bar, and it is the one with the rule in it", async () => {
  // ===== WHY THIS IS THE GUARD AND NOT A GREP FOR `memberCount` =====
  //
  // Trap 16: guard the chokepoint, not the vocabulary. A bar over a head count
  // can be written a hundred ways and named anything; what it cannot do is
  // avoid being a bar. So the property is *where bars may be drawn*, and the
  // answer is one file — which is also the file that documents H4.
  const files = await walk(path.join(repoRoot, "app"));
  ok(files.length > 20, `the walk found ${files.length} app files`);

  const offenders: string[] = [];
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    if (!BAR.test(src)) continue;
    const rel = path.relative(repoRoot, file);
    if (rel !== path.join("app", "ui.tsx")) offenders.push(rel);
  }

  // The canary first: an empty read would make the assertion below pass over
  // nothing, and the one file that *should* match proves the pattern works.
  const ui = await fs.readFile(path.join(repoRoot, "app", "ui.tsx"), "utf8");
  ok(BAR.test(ui), "the pattern matches the file it is supposed to — an empty read proves nothing");

  eq(
    offenders,
    [],
    "every bar in the app is drawn by app/ui.tsx — a hand-rolled one is how a bar " +
      "over a raw member count gets in, and H4 forbids exactly that",
  );
});

// ── H1 and H2 · help, everywhere, and the guides inside ─────────────────────

test("every portal page carries an i overlay", async () => {
  // H1 — *"an `i` icon on everything in both portals."* The floor a guard can
  // hold is one per page; whether every figure on it has one is a judgement,
  // and a guard that counted would be satisfied by empty overlays.
  //
  // The guides pages are excepted **by their path**, not by a list: a page
  // whose entire content is the explanation does not need an icon opening a
  // shorter one. Being derived, the exception covers a guides page added later
  // and cannot outlive its subject the way a named allowance can.
  const pages = (await walk(path.join(repoRoot, "app", "portal"))).filter((f) =>
    f.endsWith(`${path.sep}page.tsx`),
  );
  ok(pages.length > 12, `both portals were walked (${pages.length} pages)`);

  const missing: string[] = [];
  for (const file of pages) {
    const rel = path.relative(repoRoot, file);
    if (rel.includes(`${path.sep}guides${path.sep}`) || rel.endsWith(`guides${path.sep}page.tsx`)) {
      continue;
    }
    const src = await fs.readFile(file, "utf8");
    if (!/(<Help\b|\bhelp=\{)/.test(src)) missing.push(rel);
  }
  eq(missing, [], "H1 — an i icon on everything, in both portals");
});

test("both portals have their guides inside them", async () => {
  // H2 — *"a docs and guides section **inside** each portal — not a link to
  // the marketing site."* The brand portal has had one since Sprint 10; the
  // owner portal did not until Sprint 11, and nothing noticed, because H1 and
  // H2 read as one rule and are two.
  for (const portal of ["brand", "server"]) {
    const pages = (await walk(path.join(repoRoot, "app", "portal", portal))).map((f) =>
      path.relative(repoRoot, f),
    );
    ok(
      pages.some((p) => p.includes(`${path.sep}guides${path.sep}`)),
      `the ${portal} portal has a guides section of its own`,
    );
  }

  // And it must be reachable, or it is a page nobody finds. The layout is
  // where a portal's nav lives, so that is where the link has to be.
  for (const [portal, layout] of [
    ["server", path.join("app", "portal", "server", "[guildId]", "layout.tsx")],
    ["brand", path.join("app", "portal", "brand", "[brandId]", "layout.tsx")],
  ]) {
    const src = await fs.readFile(path.join(repoRoot, layout), "utf8");
    ok(/guides/i.test(src), `the ${portal} portal's nav links to its guides`);
  }
});
