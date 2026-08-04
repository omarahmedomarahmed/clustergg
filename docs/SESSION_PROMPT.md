# Session prompt — hand this to a fresh session

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

WHERE TO START — small first, heavy after
Follow "The suggested order" table under the build ledger. Wave 1 is the quick
UI wins and they come first:

  B9  the nav marketplace badge
  B26 LoL ranks rendering as numbers, and the summoner level appearing twice
  B25 the gamer's Discord card: trophy case ×3, one button per linked account
  B10 one background image behind the nav + Profile-of-the-Week group
  B12 planet hero shows live challenges only; completed ones move to the page
  B24 park localization — delete the language switch from the footer
  B7  the screenshot plumbing (see below — do this one early)
  B2  the CP coin
  B27 the bot card button sweep

Ship each of these as its own commit, pushed, before moving on. Then wave 2 (the
CP economics model and everything that spends its numbers), then wave 3.

Read the Wave 0 note first: B1 fixes the bot announcing every account link to
every server on the network. If the bot is live in real servers today, do B1
before anything in wave 1. If it is not, leave it for wave 2.

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
