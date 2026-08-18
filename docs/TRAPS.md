# Traps

Every trap I actually fell into building this branch. Not lessons, not
principles — the specific mistakes, in the specific shapes they arrived in, so
you can recognise one while you are inside it.

Each entry is four lines: **what I did · why it looked right · what it cost ·
what catches it now.** Four minutes to read. Read them before you write
anything, and read them again the first time you are about to say "verified".

The order is roughly worst-first, not chronological.

---

## 1 · A green test that has never failed is not evidence

**What I did.** Wrote a test suite, watched it pass, reported the guard as
proven.

**Why it looked right.** Every assertion was true. The suite was green. The
thing it described was in fact the case.

**What it cost.** Nothing was proven. A test that passes on a correct
implementation and *also* passes on a broken one is not distinguishing between
them — it is just describing the world. I shipped several of these before the
first break went green and showed me what I had.

**What catches it now.** The rule that governs everything else here: **break the
code, watch the test go red, restore it, watch it pass, and confirm the break
was actually reverted.** `tests/PROVEN.md` records all 118 breaks with what went
red. A guard with no row is not a guard yet.

---

## 2 · An assertion that cannot fail is decoration however true it is

**What I did.** Asserted, in the payments suite, that routing a paid invoice
leaves the vault consistent. True. Green. Meaningless — `routePaidInvoice`
refuses on the ledger three layers down, so the property could not vary. The
assertion was checking a thing that was already impossible to break at that
point.

**Why it looked right.** It read like the invariant the whole platform rests on.
It was in the right suite, next to the right code, phrased in the right words.

**What it cost.** The prize-vault invariant — the one load-bearing rule in the
money model — was un-guarded in the suite that most looked like it guarded it. I
only found it by breaking two guards at once and watching *nothing move.*

**What catches it now.** Before writing an assertion, ask **"can this FAIL?"**
Not "is it true" — can it fail. Construct the input where the property varies,
or move the assertion to where it does. If a guard three layers down already
makes failure impossible, the assertion belongs at that layer, not this one.

A worked example from Sprint 4: `deriveUnlock({age, country, links: 0})` with no
path is *true* to assert is not unlocked — but it cannot fail, because with no
`guildsGranted` both defaults refuse. Adding `guildsGranted: true` is what makes
it discriminate between the two possible defaults. One field, and the difference
between a guard and a sentence.

---

## 3 · "Build clean" is not "typecheck clean"

**What I did.** Ran `npm run build`, saw it succeed, reported the sprint closed
with a clean build.

**Why it looked right.** The build compiles the app. If the app compiles, the
types are fine — that is what compiling *is*, surely.

**What it cost.** `npm run typecheck` was **not** clean. The error it was
reporting was `vault.ok` — a property that does not exist on that type; the
field is `vault.holds`. `undefined` is falsy, the assertion was
`ok(vault.ok || …)`, the `||` carried it, and the suite was green. Next's build
does not run `tsc --noEmit` over the test tree. The two commands answer different
questions and I treated them as one.

**What catches it now.** `npm test` is `tsc --noEmit && tsx tests/run.mts` —
typecheck runs **first**, so a type error stops the run instead of being buried
under three hundred passing assertions. `94-reachability` asserts the script
still does this, and asserts the ordering. And the reporting rule: say
"typecheck clean" only after `npm run typecheck` has actually been run.

---

## 4 · Reading the old branch to find out what a decision was

**What I did.** Nothing — this one I was warned about, and the warning was the
most valuable thing in `CLAUDE.md`. It is here because the temptation was real
and constant, especially when `ported/` did not have something I wanted.

**Why it looks right.** The old code *does* answer the question. It compiles, it
ran in production, somebody thought about it. It feels like evidence.

**What it costs.** It encodes a *previous* decision and nothing in the file says
which. Three prior sessions inherited each other's mistakes this way: a test
suite enforcing a revenue ceiling nobody believed, a document quoting an owner's
withdrawal floor at twice its real value, a compliance analysis deleted while
ten files still cited it.

**What catches it now.** Only discipline. If it is not in `ported/`, **ask.** The
cost of asking is one message. The cost of guessing is a decision nobody made,
propagated with confidence, discovered three sprints later.

---

## 5 · Retyping a number instead of importing it

**What I did.** Typed `35_000` into the brand billing page. Wrote "for five
years" into the brand trophies page.

**Why it looked right.** The number was correct. Writing `$350` is clearer to
read than `{formatCents(CHALLENGE_PRICE_CENTS)}`, and it was never going to
change.

**What it cost.** The first one I caught myself. The second was caught by the
copy guard, which is the only reason I know the first was not a one-off — I do
this reflexively when prose reads better with a literal in it. A price that
lives in two places has two answers the day one of them moves.

**What catches it now.** `03-copy` scans rendered copy for figures that should
be imports. House rule 2 is not about tidiness; it is about the day the owner
changes a number and nine of ten surfaces update.

---

## 6 · Deleting a route and leaving everything that pointed at it

**What I did.** Deleted `/api/portal/unlock` and the portal-key model with it.
Left `app/login/[kind]/page.tsx` in place, still describing the deleted model,
still posting to the deleted route. Three live call sites redirected into it.
`/login/brand` did not exist at all.

**Why it looked right.** The deletion was correct and the typecheck was clean.
**A route is a string.** Nothing in the type system connects `redirect("/x")` to
whether `/x` is served.

**What it cost.** Brand login was broken end to end and the band was green. The
user found it, not me. That is the worst outcome in this file — 277/277 on a
platform where a brand could not sign in.

**What catches it now.** `tests/band1/94-reachability.test.ts` walks `app/` and
`lib/`, extracts every redirect target, `href` and form action, and proves each
one resolves to a page or a handler that exists on disk. It also reads the API
route list **out of `docs/04-SURFACES.md` §5** rather than a hand-kept copy, so
a route the spec promises and nobody built is a failure.

---

## 7 · My own guard had two holes, and both breaks went green

**What I did.** Wrote guard #6 above, felt good about it, moved on.

**Why it looked right.** It caught the bug it was written for. I broke it once,
it went red, I recorded it as proven.

**What it cost.** It walked `app/` only — and two of the three broken redirects
lived in `lib/portal/session.ts`. And its stale-credential check *exempted any
file mentioning "one-time invite"*, which meant the brand login page exempted
itself from the check written because of it. I found both by breaking the guard
in ways it should have caught and watching nothing happen.

**What catches it now.** The guard walks `lib/` too, and has a canary assertion
that says so — `ok(files.some(f => f.includes("lib/portal/session.ts")))` — so
the walk cannot silently stop covering it. And it strips comments (`withoutComments()`)
rather than exempting files, because an exemption list is a hole with a name.

**The transferable part:** break your guard the way an adversary would, not the
way you wrote it. One break is a coincidence.

---

## 8 · Breaking the schema when the schema is not what runs

**What I did.** To prove the "one game account, one gamer" rule, I removed the
`uniqueIndex` from `lib/db/schema.ts` and re-ran the band.

**Why it looked right.** That is where the constraint is declared. Remove the
constraint, the guard should fail.

**What it cost.** It went green, and for about a minute I believed the guard was
dead. The test database is built from `drizzle/*.sql`, not from `schema.ts` — my
break never reached the running system. The real guard was in
`lib/identity/accounts.ts` all along.

**What catches it now.** Nothing automatic. The lesson is procedural: **a break
that changes nothing is not a passing test, it is a failed experiment.** If a
break goes green, first ask whether the break actually applied. A break you
cannot see take effect proves nothing in either direction.

---

## 9 · Shipping a column a sprint ahead of the gate that protects it

**What I did.** Added `users.staffTitleId` in Sprint 3, because the schema
change was small and Sprint 4 was going to need it.

**Why it looked right.** A nullable column nobody writes to is inert. Landing
schema early is normal, and it saves a migration later.

**What it cost.** The gate that decides who may grant a staff title — ST1,
super-admin only — did not exist yet. For a sprint, the platform had a
privilege field with no rule attached to it. The user caught it.

**What catches it now.** `lib/admin/staff.ts` and `tests/band1/95-staff.test.ts`,
written before anything else in that sprint. The rule that came out of it: **a
field that grants power ships in the same commit as the check that guards it, or
it does not ship.**

---

## 10 · One predicate doing two jobs

**What I did.** Wrote `isGuildManager`, which answered both *may they see this
portal* and *may they move money*.

**Why it looked right.** They are the same people almost always. One function is
less code and one place to fix a bug.

**What it cost.** It was also wrong on its own terms — it accepted MANAGE_GUILD,
which P2 never grants. But the shape is the real trap: owner and administrator
are **two separate checks**, and a single predicate is one careless edit away
from letting an administrator withdraw. It was dead code by the time the user
found it, which is the only reason it cost nothing.

**What catches it now.** `lib/portal/permissions.ts` has five separate
capability functions and a header stating *"there is deliberately no
`isGuildManager` in this file."* `mayWithdraw` has four independent gates, each
with its own reason string. Convenience that merges two authorities is not
convenience.

---

## 11 · The band was green on a platform with no HTTP surface

**What I did.** Built ten stages and three sprints. Reported 277/277.

**Why it looked right.** Every module was tested, every rule was guarded, the
four-week simulation ran end to end. The logic was genuinely correct.

**What it cost.** Eight routes named in `docs/04-SURFACES.md` §5 had no handlers
and appeared in no sprint. A gamer could not press Join. Stripe appeared exactly
once in the whole plan, in Sprint 14, the last one — so the thing that takes the
money was scheduled after everything that spends it. The user found all of it.

**What catches it now.** Sprint 4a built the wiring, and the reachability guard
reads the route list out of the spec — a promised route with no handler is a red
band, not a discovery. **A band that only tests what you built tells you nothing
about what you did not.**

---

## 12 · Two numbering series in one file

**What I did.** Started `tests/PROVEN.md` numbering at 1 for the ten stages,
then restarted at 1 for the rebuild.

**Why it looked right.** Each sprint's guards are a coherent set. Numbering
per-sprint reads naturally while you are in the sprint.

**What it cost.** 24 duplicated ids. "Guard 51" had two answers, and thirteen
prose references pointed at whichever one you assumed. When I renumbered, the
phrase *"Guards 42 and 43"* was plural and slipped my regex — caught by hand,
not by the fix.

**What catches it now.** One continuous series in document order, a rule at the
top of the file saying ids are never reused, and an assertion in
`94-reachability` that fails the band on a duplicate or a gap. The continuity
half is what matters: a row cannot be inserted without renumbering, so the prose
cannot quietly drift away from the rows it cites.

---

## 13 · Killing the wrapper and leaving the server

**What I did.** Started a dev server, killed the `npm` process, started another
one.

**Why it looked right.** `kill <pid>` on the thing I started. The shell came
back. Job done.

**What it cost.** `npm` is a wrapper; `next-server` was still holding port 3000.
The replacement died with EADDRINUSE, and every check after that hit a **stale
build** — I spent a while debugging behaviour that had been fixed in code the
running process had never compiled.

Its close cousin, hit again in Sprint 4: running band 2 against a server started
before the fix. Same symptom, same wasted time, different cause.

**What catches it now.** House rule 9, and the habit of verifying the port is
actually free (`curl -sf localhost:3000 || echo down`) rather than trusting that
a kill worked. And: **rebuild before re-running band 2, always.** `next start`
serves `.next`, not your source.

A footnote that cost me a command: `pkill -f next` also matches the agent's own
process, whose command line contains the word. Kill by recorded pid.

---

## 14 · Trusting a warm database between runs

**What I did.** Wrote the band-2 screenshot pass with fixed emails and a fixed
in-game name.

**Why it looked right.** It passed. Twice, even — the first run created the
rows, and I did not notice the second run was passing for a different reason.

**What it cost.** The third run failed at "you already have an account with that
email", then at L1 (one game account belongs to one gamer, forever). Both
refusals were **correct behaviour** — which is what made it confusing. The test
was photographing the wrong screen and the platform was fine.

**What catches it now.** A per-run suffix on every identity the pass creates,
with a comment saying why. **A screenshot pass that is not idempotent will
eventually photograph a refusal and call it a happy path.**

---

## 15 · Reading a page's text and getting the RSC payload

**What I did.** Asserted on `textContent("body")` in band 2.

**Why it looked right.** It is the standard way to read a page's text.

**What it cost.** `textContent` includes `<script>` contents, and a React Server
Components page inlines its whole payload there. Assertions about what is "on
the page" were matching serialised props no human can see — including, at one
point, a string I was asserting was *absent*.

**What catches it now.** `tests/band2/visible.mts`, which uses `innerText`.
Two footnotes learned the hard way: `innerText` honours `text-transform`, so a
CSS-uppercased button does not match lowercase text; and a regex like
`/code is\s+(\S+)/` against innerText swallows the sentence's full stop into the
capture, which then fails validation somewhere else entirely.

---

## 16 · A regex that matched too much, and a census that was too broad

**What I did.** Guarded "the `guilds` scope is only requested in one place" by
searching for the string `"guilds"` across `app/` and `lib/`.

**Why it looked right.** The scope is a string. Find the string, find the
requesters.

**What it cost.** Eight files matched: an onboarding step name, a database table
name, a field on Discord's response, and the module that declares the *type*.
The guard's expected list would have been eight paths for two reasons — and a
guard whose expected list churns on unrelated edits is a guard somebody deletes.
The narrower version I tried next (`scopes?\s*[:=].*guilds`) then missed a
deliberate break named `SIGNUP_SCOPES`, because it was case-sensitive.

**What catches it now.** Guard on the **function** that builds the consent URL,
not the word: every caller of `discordAuthUrl`, with the declaration filtered
out. One expected path, and it fails on exactly the event worth catching.
**Guard the chokepoint, not the vocabulary.**

---

## 17 · A dynamic route segment that silently absorbs your typo

**What I did.** Broke the onboarding redirect to `/api/auth/discord-guilds` to
prove the reachability guard would catch it. It stayed green, and I assumed the
guard had a hole.

**Why it looked right.** A redirect to a route that does not exist is exactly
what the guard is for.

**What it cost.** Nothing, but only because I checked before "fixing" a guard
that was correct. `app/api/auth/[provider]/route.ts` matches **any**
`/api/auth/*`, so `/api/auth/discord-guilds` really is served — by the
game-provider handler, which answers *"we do not run challenges on
discord-guilds"* and drops the person back on `/settings/connections`. The guard
was right; the failure mode is invisible to it **by construction.**

**What catches it now.** Guard 115: an explicit assertion that
`app/api/auth/discord/route.ts` exists as a static route of its own. Proven by
moving the file — one test red, the other 303 green, which is the whole point.
**A dynamic segment is a catch-all. Anything sharing its prefix needs its own
assertion, because reachability will always say yes.**

---

## 18 · The evidence exists; nobody reads it

**What I did.** Proved that the under-13 fingerprint survives account deletion —
`ok(await isBlocked(db, hash))`, green, recorded as guard 24.

**Why it looked right.** U3 says the answer cannot be retaken. The fingerprint is
the mechanism. The fingerprint demonstrably survives. Rule guarded.

**What it cost.** The fingerprint was **read by exactly one door.** The email
signup route and the Discord callback both created a `users` row without ever
looking at it. A child who answered "under 13" could sign up again with the same
address, or sign in again with the same Discord account, and be straight back
in. Found in Sprint 4 by the screenshot record, whose "cannot come back with a
different answer" step photographed a **successful signup.**

This is trap #2 one level up, and it is the most dangerous shape in this file:
*"the evidence is recorded"* and *"the evidence is consulted"* are different
claims, and a guard on the first reads exactly like a guard on the second.

**What catches it now.** The check moved into `lib/identity/gamers.ts`, at the
point the row is made, so every door inherits it — including doors added later.
Guards 116–118, the last being the negative half: without it, a function that
refuses *everybody* satisfies the other two.

**Ask this of every rule you guard: what reads it?** Not what writes it. What
reads it, and is every path that should read it going through that code?

---

## 19 · A test that hangs is a test that will be deleted

**What I did.** Wrote band-2 waits on `data-step`, which is the derivation
exposed on the page.

**Why it looked right.** It is genuinely the best available signal — waiting on
the DOM state rather than a URL means the wait also asserts that the derivation
drives the UI.

**What it cost.** Nothing yet, but it is worth writing down: when the flow
changed underneath it, the pass did not fail with a clear message — it timed out
after fifteen seconds waiting for a step that no longer came next. Three
consecutive debugging rounds each cost a fifteen-second timeout and a guess.

**What catches it now.** Nothing automatic. The habit: when a browser wait times
out, **probe what is actually on screen** before changing the wait. A six-line
throwaway script that prints `page.url()` and `innerText` answers in one run what
three edits guess at.

---

## 20 · Interactive tooling in a non-interactive session

**What I did.** Ran `drizzle-kit generate` on a migration that both added and
dropped columns.

**Why it looked right.** It is the documented command.

**What it cost.** drizzle-kit could not tell a rename from a drop-plus-add and
opened an interactive prompt, in a session with no terminal to answer it.

**What catches it now.** Split into add-only, then drop-only, so nothing is
ambiguous and no prompt appears. Generally: **a tool that asks questions cannot
run here, so structure the input so it has none.** The same discipline the owner
constraint imposes — no terminal, ever — applied to my own tooling.

---

## 21 · Fixing one door of two

**What I did.** Found U3 missing from the email signup route (trap #18), fixed
it there, and started writing the guard.

**Why it looked right.** That was the door the screenshot record proved broken.
Fix what you can prove is wrong; do not speculate.

**What it cost.** It would have cost a false sense of safety. Checking who else
created a `users` row took one grep and turned up `shadowGamerForDiscord`, used
by the Discord callback — the same defect, second door. **Fixing one and
guarding it would have made the guard green while the hole stayed open**, which
is strictly worse than not fixing it, because a green guard stops anybody
looking.

**What catches it now.** The fix moved to the creation point rather than the
doors. And the habit: when you find a rule missing from one call site, **grep
for the other call sites before you fix it.** The question is never "is this
door broken", it is "how many doors are there".

---

## 22 · Scope discipline versus a real defect

**What I did.** While finishing Sprint 4 — explicitly instructed not to start
Sprint 5 and not to "just also" anything — found the U3 hole above.

**Why the tension is real.** "Do not expand scope" and "do not leave a
child-safety guard bypassed" both apply, and they point opposite ways.

**How I resolved it.** A *defect in the thing you are finishing* is not scope
expansion; a *feature you noticed you would like* is. The U3 hole was found by
Sprint 4's own screenshot record, sat in the identity module Sprint 4 is about,
and cost three files. The bot-install flow I also noticed was missing — real,
and genuinely Sprint 5 — got a sentence of honest copy on the page and a note in
the handoff instead.

**What catches it now.** Nothing automatic, and it should not be automatic. The
test I used: *would leaving this make the work I am reporting as done actually
not done?* If yes, fix it and say so loudly. If no, write it down and leave it.

---

## 23 · Believing a page works because it compiles

**What I did.** Built the owner path's `guilds` step, typechecked clean, moved
to writing guards.

**Why it looked right.** Every import resolved. The action existed. The redirect
target existed.

**What it cost.** Nothing, because I checked — but the near-miss is instructive.
`requestGuildsScopeAction` redirects to `/api/auth/discord?kind=guilds`, and had
`app/api/auth/discord/route.ts` not existed, `[provider]` would have swallowed it
(trap #17) with a clean typecheck and a green band. The gap between "it
compiles" and "it works" is exactly the size of every string in the codebase
that names something.

**What catches it now.** Reading the handler at the other end of every redirect
I write, once, before believing the flow. Cheaper than any guard.

---

## 24 · A whole sprint can ship with no user interface

**What I did.** Built Sprints 6, 7 and 9. Each one shipped a complete, correct
library, a full guard suite, and **no page**. `spend.ts` — 12 §6's central money
rule — had no request screen and no approve screen. `consent.ts` — 330 correct
lines — had no analytics tab. `registry.ts` — all eight sections — had no
`/admin/servers/[guildId]`, which is *the page 12 §8 exists for*.

**Why it looked right.** Every sprint closed with the band green, every guard
proven by breaking, PROVEN.md updated, PLAN §2.0 marked done. The libraries
really were correct. And the sprint tables in PLAN name **builds**, which reads
as modules — the "a human can" line is the part that names a surface, and it is
one line at the bottom of a table I had already convinced myself I had
satisfied.

**What it cost.** Three sprints marked done that a user could not reach. The
reviewer found it, not me, and not the band — because every guard called the
module **directly**. Not one asked whether a surface did.

**What catches it now.** `tests/band1/94-surface-reach.test.ts`. Roots are the
files under `app/`; reachability follows imports through `lib/`, dynamic ones
included. A test is not a surface — all three modules *were* called, by their
own tests, which is why "called from anywhere" would have passed. It was
committed **red**, naming ten modules: the three known and seven nobody knew
about.

**The transferable part:** *"a human can"* is not the last line of a sprint
table, it is the definition of done. Read it first.

---

## 25 · Committing while the band was red, because I ran it in the wrong order

**What I did.** Fixed a hole, committed, then ran the band as part of the next
break cycle — and the pre-break run said 400/401.

**Why it looked right.** Every one of my commits that stretch had been preceded
by a green run. This one was preceded by a green run *of the previous change*.
The habit had degraded from "run, then commit" into "run near committing".

**What it cost.** One red commit in the history, caught two minutes later
because the break harness prints the baseline. Nothing shipped. But the rule I
broke is my own, it is written in my instructions, and it is the one that makes
every other claim in this repository checkable.

**What catches it now.** Nothing automatic, and it should not be automatic —
the fix is the order, not a tool. `npm test` **before** `git commit`, in the
same breath, every time. The break harness refusing to start on a dirty tree is
what surfaced it, which is worth keeping for that reason alone.

---

## 26 · A negative half that corrupts the fixture must run last

**What I did.** Added the missing falsifiable half to a W4 test — mutate a
credit, assert the reconciliation says no — and put it directly after the
assertion it was fixing, in the middle of the test.

**Why it looked right.** It reads best there: the positive claim, then
immediately the proof it can fail.

**What it cost.** Everything below it was now reading numbers the block had
deliberately broken, and the *"at least one credit is a half"* assertion below
went red. A minute to find, and it made the test look wrong when the test was
right.

**What catches it now.** The habit, written where it happened: **an assertion
that mutates state on purpose goes last, and says why it is last.** A test is
also a fixture for everything after it in the same test.

---

## 27 · A break that the fake has no way to receive

**What I did.** To prove refresh never lists guild members, added
`await fetcher.members?.(guildId)` to `refreshGuild`. The band stayed green.

**Why it looked right.** The file changed, the harness confirmed it, so the
break had "applied". It looked like a blind guard.

**What it cost.** Nothing, because I checked — but it briefly read as a hole in
a guard that was fine. The test's fetcher object has no `members` key, so `?.`
short-circuited and **nothing executed**. The source changed; the behaviour did
not.

**What catches it now.** Trap 8's rule, refined: a break must be reachable *by
the test*, not merely present in the file. And the guard gained the half a call
list cannot see — a source assertion that nothing in the module names a
member-list path, because the realistic break is a direct REST call **beside**
the injected fetcher, not through it.

---

## 28 · Comparing three fields somebody remembered

**What I did.** Guarded *"no weekly-cycle dollar reads `guild_snapshots`"* by
comparing `guildId`, `totalCents` and `conversion` between a run with the table
full and one with it empty.

**Why it looked right.** Those are the money fields. If money does not move,
nothing that matters moved.

**What it cost.** A break that read the table and nudged **activation** sailed
straight through. And the fixture gave *both* servers a snapshot row, so any
read cancelled out in the percentile ranking — two independent reasons the
guard could not fail, in a guard on the rule an entire feature rests on.

**What catches it now.** The whole division is compared, not a field list, and
exactly one server has a row — which is the realistic shape, since the grant is
per server. **A hand-picked list of fields is the file-list defect one level
down**: it guards what somebody thought of, and forgetting is the failure mode.

---

## 29 · An anchor table that does not cover what was added

**What I did.** Widened an access rule, expecting `91-admin-access`'s literal
case table to catch it. Green.

**Why it looked right.** That table exists *because* the rest of the suite
derives its expectations from `ROUTE_ACCESS` itself (break 20's lesson). It is
the one place values are stated literally.

**What it cost.** Nothing yet. The page census caught the new routes as
**unclassified** — silence is not a decision — which is what put them in
`ROUTE_ACCESS` at all. Nothing then asserted *which* classification, so the
anchor had a gap exactly where new work lands.

**What catches it now.** Rows for every route added, and the habit: **the
census tells you a route needs a decision; the anchor is where the decision
goes.** Two guards, two questions, and answering the first does not answer the
second.

---

# The four questions

If you remember nothing else:

1. **Can this assertion FAIL?** Construct the input where the property varies.
2. **What reads this rule?** Not what writes it — what reads it, and does every
   path go through that code?
3. **Did my break actually apply?** A break that changes nothing proves nothing
   — and "applied to the file" is not "reachable by the test".
4. **Is this the only door?** Grep before you fix.
5. **Does anything render this?** A library with no surface is a feature that
   does not exist, however green its guards are.

---

## 30 · A red I cannot name, because I did not capture the output

**What I did.** Ran `tests/band2/portals.mts` and read the result off the
terminal with `| tail -30`. It printed *"1 portal browser assertion failed."*
The `✗` line was somewhere above the tail window, so I re-ran the pass to see
which one — and the second run was green.

**Why it looked right.** Re-running is the obvious next move, and a browser
pass that goes green on the retry reads as a flake in something incidental.
Five further runs — three with a fresh seed, one back to back — were all green,
which makes the "it was nothing" story more comfortable each time.

**What it cost.** Nothing yet, and that is the problem. A red I cannot name is
not a red I have ruled out. The failing run's output no longer exists, so the
only honest statement about it is *one assertion failed and I do not know which
one*, which is exactly the sentence somebody stops reading after the words
"went green on the retry".

Trap 8's rule says a break that changes nothing proves nothing. This is the
mirror of it: **a pass that goes green on a re-run does not retract the run
that went red.** The two runs are two facts, not one fact and a correction.

**What catches it now.** Every band-2 pass is run into a file —
`npx tsx tests/band2/x.mts > out.log 2>&1` — and the file is grepped, never the
terminal. It costs nothing, it survives the scrollback, and it turns "somewhere
above the tail window" into a line number. `tail -30` on a pass that prints
seventy-eight assertions was never going to show me a failure in the middle.

---

## 31 · A fence that keeps a card standing also keeps you from noticing it fell

**What I did.** Built the card families, ran the band green, and pressed a real
button on a real build to check a human could reach one. The interaction
answered `200`. The log said:

```
[card] decoration failed and was skipped: card — No fonts are loaded.
```

Every card on the platform was throwing in the renderer and arriving as text.

**Why it looked right.** House rule 11 is *"a decoration may never take a card
down"*, and the fence was doing precisely that: catching the throw, logging it
with the reason, and delivering the card without its picture. Band 1 green.
Band 2 green. Every card delivered. Nothing had failed anywhere, because
nothing was **allowed** to fail.

**What it cost.** Nothing yet, and only because I looked. `ImageResponse` uses
its vendored font when `fonts` is *omitted* and throws when handed `fonts: []`
— and `loadCardFonts()` returns `[]` when no brand fonts are installed, which
is the documented normal case. One line, and the product had silently lost its
entire visual identity: 04 §4 asks for *"a rendered image, consistent,
branded"* and it was shipping plain text.

**What catches it now.** Guard 210, and the shape of it is the transferable
part: **it asserts bytes returned, not that the fence reported success.** A
card that degraded to text also succeeds, so a guard phrased as "the card was
delivered" is green on exactly the failure it exists to catch.

The general rule: **a fence converts a failure into a degraded success, so
every fence needs a guard on the un-degraded case.** Fencing is not the same as
handling, and the log is the only place the difference is visible — which is
why "press it and read the log" earned its place in the routine rather than
"press it and see a 200".

A footnote from the same investigation, because trap 13 caught me again: I
killed the `npx` wrapper, `next-server` kept port 3000, my replacement died
with `EADDRINUSE`, and the server answering my signed interactions was the
**old** one, started without the public key. The symptom was `401 bad
signature`, which reads as a signing bug and is not one. Kill by finding the
`next-server` pid, and check the port is free before believing anything.

---

## 32 · A wait that was already true, and the red I could finally name

**What I did.** Ran the four band-2 passes twice back to back. The second
`portals` run failed one assertion: *"and an owner's thread waits on us too"*.

**Why it looked right.** The step reads: fill the textarea, click Send, wait for
`h1`, read the page. Waiting for the heading looks like waiting for the page.

**What it cost.** An hour, and it is worth being exact about what was and was
not established. `h1` is on that page **before** the click as well, so the wait
was satisfied immediately and the read could land on the pre-send page. That is
a real defect in the pass, demonstrable by inspection. What I could **not** do
is reproduce the failure: eight further runs were green, seeded and unseeded.

So the honest statement is: the wait was capable of returning early, it now
waits on a marker unique to this run, and I cannot prove that is what failed —
only that it could have. Writing "fixed" here would be a claim one size larger
than the evidence.

**What catches it now.** A per-run marker in the message body, and a wait on
`li:has-text(RUN)`, which cannot be true before the send. Both message pages
also carry `data-testid="thread-state"` with `data-awaiting`, so the state is
assertable rather than inferred from a sentence.

**The transferable part, and it is trap 30's other half.** This is the same
failure I could not name last sprint — a `portals` red that went green on the
retry. The difference this time was one habit: **every band-2 pass ran into a
file.** The failing assertion was still there to read, in a log from a run that
had finished twenty minutes earlier. That single change turned "one assertion
failed and I do not know which" into a line number and a fix.

The rule underneath both: **a wait that is already true is not a wait**, and it
fails only under load — which means it fails in exactly the run you are least
able to reproduce.

---

## 33 · I left a mutation harness running for an hour and kept reading the tree it was editing

**What I did.** Started `npm run mutate` with `nohup … &`, from a command whose
redirect referenced a shell variable the parent had not set. The redirect
failed, the background *task* was reported as failed within seconds — and
`nohup npm run mutate` carried on running, detached, for **an hour and
nineteen minutes**.

**Why it looked right.** The task notification said `status: failed`. I read
the output, saw `tail: cannot open …`, restored the one file `git status`
showed as modified, and moved on. Everything about that reads as "the job did
not run".

**What it cost.** Every `git status`, every `npm run typecheck`, and one whole
"prove the new guard works" experiment ran against a tree a live process was
mutating and restoring underneath me. I restored `lib/money/amounts.ts`,
declared the tree clean — and it was, *at that instant*, because the harness
had just restored it and not yet mutated the next file. Ninety seconds later
`lib/pool/score.ts` was carrying *"delete the flat participation share"* and I
had no idea where it had come from.

Nothing shipped wrong, because the new dirty-tree guard caught it and named the
file. But I spent twenty minutes reconstructing a history that had a much
simpler explanation than any of the ones I tried first.

**What catches it now.** Two things, and the second is the one that matters.

The harness **refuses to start on a dirty tree** and names the files, so a
mutation left behind by a killed run is caught by the next run rather than by
somebody reading a diff.

And the habit: **house rule 9 is not only about servers.** *"Kill background
tasks you start"* covers anything that outlives the command — and a process
that edits source files is far worse to leave running than one that holds a
port. A stray server serves a stale page; a stray mutation harness makes every
subsequent observation a race.

**The transferable part:** a background job reported as *failed* is a statement
about the **command**, not about every process it spawned. `nohup` exists
precisely to survive that. Before trusting a tree, `ps` for what you started —
and prefer a foreground run with a long timeout over a detached one you cannot
see.

---

## 34 · `git checkout <file>` restores HEAD, not "before my break"

Restoring a break with `git checkout lib/discord/admin.ts` threw away the
**fix** in the same file, because the fix was not committed. The file went back
to HEAD, which was the state before both.

It looked fine, too: the band came back at 443/445, two red — the same two that
had been red under the break. I read that as "the break is still applied" for
long enough to run the whole band again.

The three restores before it were safe by accident: those files were unmodified
at HEAD, so HEAD *was* the pre-break state.

**Restore the way the harness does — from the bytes read before the break, not
from git.** `python3` writing the string back, or a copy of the file. Reach for
`git checkout` only after checking `git status` shows the file clean.

## 35 · A mutation whose `find` never matched, and the hour it cost

`Let an administrator withdraw` was written with four spaces of indentation
against a line that has two. The harness reported it correctly — *"the line it
mutates is no longer in lib/portal/permissions.ts"* — but it reported it **when
the loop reached that mutation**, which on a full run was ninety minutes in.

Worse than the wait: "no longer in" is the wrong diagnosis. It never matched.
A `find` string is hand-typed and can be wrong from birth, and a mutation that
cannot apply is reported next to twenty-nine that can, in a report whose whole
purpose is to say what the band does not notice.

The related shape is quieter. `String.replace` with a string argument replaces
the **first** occurrence, so a `find` matching two places silently mutates one
and leaves the other alone — the break appears applied, the band goes green,
and the report reads as a hole in the suite rather than a defect in the
harness. That is trap 8 at one remove, and it is undetectable from the output.

**The harness now checks every mutation applies exactly once before writing
anything.** Nothing is mutated until all thirty-three are known to match one
place each.


## 34 · The migrator that nothing called — §0.1, and the one that took production down

**What happened.** Production was deployed, the build was READY, the pooled Neon
string worked, and every page answered 500 with `relation "challenges" does not
exist`. The database had **zero tables**. All 23 migrations had never run.

`scripts/migrate.mts` existed, was correct, and said so in its own header: *"On
Vercel this is the build command's first step."* It was not.
`package.json` said `"build": "next build"`.

**Why nothing caught it.** Every band was green throughout. The band tested the
migrator; nothing tested whether anybody **ran** it. This is the tenth instance
of §0.1 on this branch and the first to cause an outage — the previous nine
were invisible features, not a dead platform.

**The lesson that is actually new.** A file's own header is not a caller. Nine
times the missing reader was a page or a card; here it was a **build script**,
which no test looks at because it is not code the band imports. Any claim of
the form *"X runs at Y"* is a claim about a caller, and the caller is what to
assert.

**What now fails.** `95-deploy` asserts the build command calls the migrator
before the build, exactly as guard 53 asserts `npm test` typechecks first.

---

## 35 · The second gap in the same deploy: three cron routes and no schedule

There was no `vercel.json`. Three cron routes shipped and nothing called any of
them — the gun never fired, the sync never ran, the week never closed, on a
platform whose entire product is a weekly loop.

The same shape as 34 and worth listing separately because the **symptom is
nothing at all**. An unmigrated database screams. An unscheduled cron is
silent: every page renders, every number is stale, and no error appears
anywhere.

`95-deploy` now discovers the cron routes **from disk** and requires every one
to have a schedule and every schedule to have a route, with the cadences read
out of 01-CYCLE's own table.

---

## 36 · `CRON_SECRET`: correct fail-closed code, undocumented variable

Having added `vercel.json`, the jobs still did not run. `authoriseCron` requires
`CRON_SECRET` in production and fails closed without it — correct behaviour —
and **`CRON_SECRET` appears zero times in 10-SETUP**. Verified live: all three
routes answered 401.

Two things worth carrying:

1. A fail-closed guard plus an undocumented variable is an outage that reads as
   a code bug. The code was right; the setup document was incomplete.
2. This was found by **calling the routes**, not by reading either the code or
   the document. Neither would have shown it.

10-SETUP is ratified, so the line it needs is the owner's call. Meanwhile the
variable is listed on `/admin/preflight` as required, and `95-deploy` asserts it
stays listed.

---

## 37 · `/setup` was fully specified and did not exist

10-SETUP §2 specifies `/setup` in a five-row table with four rules under it and
says *"build it exactly like this"*. There was no `/setup`, and `SETUP_TOKEN`
appeared in no file. **The platform had no way to create its first
administrator**, so `/admin` was unreachable by anybody, forever.

`94-reachability` did not catch it because that guard reads **04-SURFACES §5's**
route list. `/setup` is named in **10-SETUP**. A guard covers the document it
was pointed at and no other — which is worth remembering before saying "the
routes are covered".

The generalisation: a route census is only as complete as the set of documents
it reads. Before trusting one, check which document it parses.

---

## 38 · Two rounds of measuring production wrong

While checking that every page was up, `/challenges` reported **200 with 1
byte**, and `/rules/gamers` reported **404**. Both were reported as findings and
both were my error:

* the 1 byte was a bad shell capture — the page consistently returns 9,312
  bytes on a direct fetch;
* the audience is `gamer`, not `gamers`, so the 404 was the route guard working
  exactly as designed.

**The lesson.** When a check against a real service says something surprising,
suspect the check first. Re-measure a different way *before* writing it down as
a defect — a false finding costs more than the check does, because somebody
then goes looking for a bug that is not there.

---

## 39 · Trap 13, again, and it looked fixed

Killing the local server: `pkill -f "next start"` reported success, `ss` showed
**port 3000 free**, and `curl` still got **200**. The `next-server` process had
been re-parented and survived both the pattern kill and the port check.

Two checks agreed and both were wrong. The only reliable answer was
`ps -eo pid,args | grep next-server`, killing the pid directly, and then
confirming with a curl that actually failed to connect.

**Never conclude a server is dead from the absence of a listener.** Conclude it
from the absence of a process, and then prove it with a request that is refused.


## 40 · A sentence can outlive the rule it describes, and no guard was looking

**What happened.** *"A gamer in two servers is worth half to each"* sat on the
public homepage for a whole sprint after Sprint 5 replaced that model with
parent + join. Every **figure** beside it was correctly imported — house rule 2
held perfectly — so `03-copy` passed, every money guard passed, and the
sentence said nothing false about a number and nothing true about the rule.

**Why it is not a copy bug.** The copy guard checks that pages do not *retype
figures*. Nothing checked that pages do not *retype rules*. A rule change
deletes the code and leaves the prose, and prose is the part nobody greps.

**The fix that generalises.** 07 N3: a sentence stating a rule is **generated
from the module that enforces the rule**. `attributionSentence()` is produced by
calling `entrantCredit` — change ½+½ and the homepage sentence changes with it,
because it is reading the same answer the pool reads.

**Three things worth carrying:**

1. **A banned-phrase guard only bans the phrase somebody already found.** The
   brief named two files. Walking the tree for *the words the module produces*
   found a third live instance on the server-owner members page, worded
   *"counts a half to each"* — a paraphrase the exact-phrase search missed.
2. **The clause that always goes first is the special case.** K13 requires
   naming the same-server 1.0 case, and every retyped version dropped it.
   Dropping it is what made the old wording sound almost right.
3. **Comments must be stripped before scanning.** Both fixed call sites now
   carry a comment quoting the dead sentence so the next reader knows why the
   import is there — and a guard reading raw source would flag the explanation.
   `withoutComments` moved to `tests/helpers/source.ts` rather than being
   declared a second time (house rule 4).
