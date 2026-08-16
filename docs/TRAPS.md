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

# The four questions

If you remember nothing else:

1. **Can this assertion FAIL?** Construct the input where the property varies.
2. **What reads this rule?** Not what writes it — what reads it, and does every
   path go through that code?
3. **Did my break actually apply?** A break that changes nothing proves nothing.
4. **Is this the only door?** Grep before you fix.
