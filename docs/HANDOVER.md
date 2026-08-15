# Handover prompt

Copy everything in the block below into a fresh session, on branch
`cluster/v3-spec`.

---

```
You are building ClusterGG v3 from nothing, on the branch `cluster/v3-spec`.

This branch is a specification with no application code. Read these first, in
this order, before writing anything:

  1. CLAUDE.md
  2. docs/00-TRUTH.md      — the ratified rules
  3. docs/01-CYCLE.md      — the spine: every surface serves one weekly loop

Then read whichever of docs/02 through docs/11 the stage you are on needs.
docs/08-BUILD-ORDER.md tells you what to build and in what order. Start at
Stage 0.

WHAT THE PRODUCT IS, IN ONE LINE
A brand buys an automated weekly gaming competition that runs inside Discord
servers — no bracket, no schedule, no lobby, no stream, no staff, no dispute.
The game's own API is the referee. $350 a challenge, billed individually.

FIVE RULES THAT ARE NOT NEGOTIABLE

1. Do not open the old branches. `claude/clustergg-audit-g2ftlm` holds the
   previous platform. Everything worth keeping is already copied into `ported/`
   with a written reason in docs/11-PORTED-CODE.md. Three earlier sessions
   inherited each other's mistakes by reading old code and assuming it encoded a
   current decision — it encoded a previous one, and nothing said which. If you
   need something that is not in `ported/`, ask. Do not go looking.

2. The owner has no terminal access, ever. Never tell them to run a command.
   Anything they must do is a click in a web dashboard, and you run everything
   else yourself.

3. If the spec and reality disagree, stop and ask. Do not reconcile them
   silently and do not assume either side is right.

4. Prove every guard by breaking it. Break the code, watch the test go red,
   restore it, watch it pass, and confirm the break was actually reverted. A
   green test that has never failed is not evidence.

5. Import numbers, never retype them. Every page, card and document pulls its
   figures from the module that enforces them.

THINGS THAT WILL BITE YOU, ALREADY WRITTEN DOWN
- The baselining rule is `max(challengeStart, joinedAt)`. Both obvious
  alternatives are wrong, and docs/03-CHALLENGES.md §2 shows why before it gives
  the rule. Read that before you write scoring.
- The prize vault is a liability ledger: its balance equals the sum of every
  unredeemed money-trophy on a live account. That invariant is what makes
  duplicate awards and double payouts structurally impossible. docs/02-MONEY.md §5.
- VALORANT cannot be sold. The Riot personal key has no VAL endpoint at all, not
  even platform status.
- The card renderer cannot decode WebP. Convert on upload, and fence the image
  so a card still renders without its artwork.
- Shared assertion helpers live in ONE module. Ninety-nine files each declaring
  their own is how one file quietly declared none and shipped three assertions
  that could never fail.

YOU NEED NOTHING FROM THE OWNER UNTIL THE END
The whole build and test cycle runs against an in-process database. No Neon, no
Stripe, no environment variables, no deployment. Build it, test it, run the
full-cycle simulation and the screenshot pass in docs/09-TEST-PLAN.md — and only
then ask them to create the database and the payment webhook, using
docs/10-SETUP.md, which is dashboard-only.

Do not open a pull request unless asked.

Start with Stage 0 and tell me what you are doing as you go.
```

---

## If they ask what to say next

The next session should come back with Stage 0 complete and a working
foundation. From there it runs through `docs/08-BUILD-ORDER.md` stage by stage.

The owner's involvement is only needed at the very end — `docs/10-SETUP.md`,
which is entirely web dashboards.
