# Session prompt — hand this to a fresh session

<!-- LEGACY-BANNER -->
> # ⚠ HISTORICAL — NOT THE PRODUCT
>
> **Nothing in this file describes ClusterGG as it is today.** It is kept
> because the reasoning is still useful and because a decision with no record
> gets made again.
>
> **Do not quote a sentence from this folder as a statement of fact about the
> product.** Two errors have already been caused by exactly that: a claim that
> brands are billed on impressions (they are billed a fixed price per
> challenge) and a claim that gifting is part of the product (it was deleted in
> B72.3, for money-transmission reasons).
>
> **The current truth, in this order:** the code, then `docs/PLAN.md`, then
> `docs/MODEL.md` and `docs/HANDOVER.md`. Where this file and the code
> disagree, the code is right and this file is history.

Copy the block below verbatim into a new Claude Code session opened on this
repository. It is written to be read cold, with no memory of the conversation
that produced the plan.

---

```
You are continuing ClusterGG. Read docs/EXECUTION_PLAN.md before doing anything
else — the whole plan is in there, written to be picked up cold. This message
only tells you where to start.

BRANCH — this matters, get it right
Work on the existing branch claude/clustergg-platform-build-mfkzaa. Do NOT
create a new branch. Do NOT push anywhere else.

  git fetch origin claude/clustergg-platform-build-mfkzaa
  git checkout claude/clustergg-platform-build-mfkzaa
  git pull origin claude/clustergg-platform-build-mfkzaa
  # ... work ...
  git push -u origin claude/clustergg-platform-build-mfkzaa

Do not open a pull request unless you are explicitly asked for one.

WHAT THE PLAN IS
Two parts, one direction. Part I is the build: 31 items, B1 through B31, open
and still growing. Part II is the verification: committed test suites, every
screenshot captured, every marketing claim proven, the full end-to-end matrix,
and human-run UAT. Part II is SEALED until Part I closes. Do not start it. Do
not write a suite "just for this one bit" — read §1.1 for why that ordering is
load-bearing rather than a preference.

FIRST, BEFORE YOU BUILD ANYTHING — double-check three claims
The plan was written by a previous session working from the code. Three of its
load-bearing claims are worth verifying yourself before you act on them, because
everything downstream assumes they are true. Confirm or correct each, and say
which in your first message:

  1. B33 says lib/discord/announce.ts:105-117 posts to guilds sequentially with
     an await, called from server actions that declare no maxDuration, so it is
     killed mid-loop past ~50 servers while the checkpoint records a plausible
     wrong number. Verify the loop, the call sites, and that no maxDuration
     applies to them.
  2. B34 says the current economy is 1,000 CP = $1 (DEFAULT_CP_PER_DOLLAR in
     lib/marketplace.ts), that ten actions in ACTION_CATALOG carry a defaultCap
     and nine do not, that the capped ten sum to 1,255 CP/day, and that
     awardAction credits every quest listening to an action with the cap stored
     per quest. Verify all four before repricing anything.
  3. B26 says lib/providers/adapters.ts returns solo_tier/flex_tier as
     { value, rankLabel } and the cards render value instead of rankLabel, and
     that a generic `level` metric shadows summoner_level. Verify both.

If any claim is wrong, fix the plan first and say so. Do not build on an
assumption you did not check.

WHERE TO START — small first, heavy after
Follow "The suggested order" table under the build ledger. Wave 0 is two live
bugs — read that row and decide whether they apply yet. Wave 1 is the quick UI
wins:

  B9  the nav marketplace badge
  B26 LoL ranks rendering as numbers, and the summoner level appearing twice
  B25 the gamer's Discord card: trophy case ×3, one button per linked account
  B10 one background image behind the nav + Profile-of-the-Week group
  B12 planet hero shows live challenges only; completed ones move to the page
  B24 park localization — delete the language switch from the footer
  B7  the screenshot plumbing (see below — do this one early)
  B2  the CP coin
  B27 the bot card button sweep

Ship each of these as its own commit, pushed, before moving on. Then B32
(email — wave 1.5, because everything in wave 2 wants to notify through it),
then wave 2 (the repriced economy and everything that spends its numbers), then
wave 3.

PART II IS SEALED — WITH ONE EXCEPTION, AND IT IS DELIBERATE
B33, B34, B35, B36, B37 and B39 carry their test suites with them, written at
the same time as the code. They are marked in R1 and the reasoning is in §1.1: a
UI bug found late costs rework, a bug in what we pay out costs cash that has
already left. Six suites out of forty. Everything else still waits for Part II.

ENVIRONMENT
The app runs entirely locally with DEMO_DB=1 (in-memory PGlite, seeded) — no
external service is needed to build or verify anything in wave 1. Build the
email layer (B32) so that it no-ops without RESEND_API_KEY, exactly as
lib/blob.ts does without its token; nothing may throw because mail is not
configured.

If Neon MCP is available to you, treat it as READ-ONLY. Do not run writes,
migrations or DDL against the production database. Schema changes go through the
idempotent COLUMN_MIGRATIONS pattern in lib/db/index.ts and reach production by
deploying, never by hand.

THE SCREENSHOT PLACEHOLDERS
B7 builds the plumbing only — the feature_shots table, the <FeatureShot>
component, /admin/shots. It captures NOTHING. As you touch any page in any wave,
drop <FeatureShot shotKey="..."> slots where a claim needs proof, and register
the key in R2. They render as visibly empty labelled placeholders and stay that
way until V1 fills them all in one pass, long after Part I closes. That is
deliberate: a screenshot taken before the copy rewrite is a picture of copy that
no longer exists.

THE RULES THAT ARE NOT NEGOTIABLE
- Commit and push EVERY chunk that stands on its own, the moment it works (§1.5).
  A build item is 3-8 commits, not one. This container is ephemeral — unpushed
  work is not slow progress, it is no progress.
- typecheck -> build -> open it in a real browser or drive it against a real
  database -> commit -> push. Never commit on "it should work" (§1.3).
- Read "Traps this codebase has already cost people days on" in §0 before you
  write a browser test. Every one of those seven has cost real time already.
- Never store a payment detail anywhere. Only a preference word and an opaque
  provider handle. See docs/PAYMENTS.md.
- /admin/users and /admin/linked-accounts are admin-only. No staff department
  reaches the gamer directory or the linked-account list, ever.
- Every new surface registers as an admin system in lib/systems.ts and is
  assignable to a department (B29). Nothing ships that admin cannot edit.
- Never renumber a build item. B14 stays B14 wherever it sits in the queue.

WHEN NEW INSTRUCTIONS ARRIVE
Follow the intake protocol in §1.2 before writing any code: append the
instruction to Part I as the next B<n>, add its row to the test registry R1, its
shot rows to R2, and any new route to R3. Then build it. The registries are how
Part II knows what to prove.

Start by reading the plan, then confirm which wave-1 item you are starting with
and get to work. Ask only if something in the plan genuinely contradicts itself.
```
