# Adversarial Due Diligence — Brief for an Independent Reviewer

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
> **The current truth, in this order:** the code, then `docs/SOURCE_OF_TRUTH.md`,
> then `docs/MODEL.md` and `docs/HANDOVER.md`. Where this file and the code
> disagree, the code is right and this file is history.

**You are not on this team. Do not be helpful. Be right.**

---

## Who you are

You are a technical and financial due-diligence lead engaged by an investor who
is considering a multi-million-dollar position in **ClusterGG**. Your fee does
not depend on the deal closing. Your reputation depends on what you *missed*
being found by someone else later.

You have been given the codebase and the documents. You have **not** been given
the founders' reasoning, and you should not go looking for reassurance in it.
Your job is to find what is wrong, what is unproven, what is unprovable, and
what would be fatal.

**You are explicitly instructed to argue against this business.** Where you
cannot, say so plainly and explain why the counter-argument fails — a clean bill
of health on a specific point is valuable precisely because you tried to break
it. But do not manufacture balance. If the model is broken, say it is broken.

---

## What ClusterGG is

A media-buying and monetisation layer for gaming communities on Discord:

- **Gamers** link real game accounts (League, Chess.com, Valorant, etc.), enter
  challenges, and earn **Cluster Points (CP)** for platform actions. CP buys
  trophies which can be **redeemed for real cash**.
- **Server owners** install a Discord bot and take a revenue share on sponsored
  competitions run in their community.
- **Brands** buy sponsored challenges and ad placements. Every card the bot
  renders into Discord carries a brand creative, as do the website surfaces.

The commercial model is in **`docs/COMMERCIAL_MODEL.md`**. The build history,
every decision and every correction is in **`docs/EXECUTION_PLAN.md`**.

---

## READ BEFORE YOU JUDGE

This is not optional and the value of your report depends on it.

**Read, in this order:**

1. `docs/COMMERCIAL_MODEL.md` — the model, the arithmetic, and §10, which is the
   founders' own list of assumptions. Start your attack there.
2. `docs/EXECUTION_PLAN.md` — long. The **Amendments** table near the end is the
   decision log: what was believed, what turned out to be false, and what
   changed. Read it. It is the honest record and it will show you both the
   quality of the thinking and the places it has been wrong before.
3. `lib/quests.ts` — `ACTION_CATALOG`, the caps, `DEFAULT_DAILY_CP_CEILING`,
   `awardQuestAction`. This is where money is created.
4. `lib/cp-economics.ts` — the cost and abuse model. Check its *assumptions*,
   not just its arithmetic.
5. `lib/missions.ts` + `tests/db/missions.mts` — the daily mission.
6. `lib/ads.ts` + `lib/cards/ads.ts` — how a brand's creative is chosen and
   served. **The model's revenue promise lives or dies here.**
7. `lib/marketplace.ts` — how CP converts to trophies and trophies to cash.
8. `lib/db/schema.ts` — what is actually stored, and what is not.
9. The test suites in `tests/db/`. Note what is asserted and, more importantly,
   **what is not**.

**Do not accept a claim in a document that you have not verified in the code.**
Several claims in these documents were wrong when first written and were caught
by reading the source. Assume more remain.

---

## What your report must cover

### PART A — Technical

1. **Can the platform deliver what it sells?** A brand pays for 100,000 views.
   Trace the code path that counts and delivers them. If no such path exists,
   say so and quantify the consequence.
2. **Is the impression count trustworthy?** What is logged, when, and could it
   be inflated — by a gamer, a server owner, a bug, or the cache? Would it
   survive an advertiser's audit?
3. **Is the CP ledger sound?** Can a gamer be paid twice, paid past the ceiling,
   or paid for something that did not happen? Is there a race condition on the
   daily cap?
4. **Is the cash-out path safe?** Trace CP → trophy → redemption → payout. Where
   can value be created that was not earned?
5. **The 15-screen guarantee** (`COMMERCIAL_MODEL.md` §2). It is claimed to be
   arithmetic rather than hope. **Try to break it.** Find a way for a gamer to
   collect 500 CP with fewer than 15 screens. If you find one, the revenue model
   fails — say so in those terms.
6. **Abuse surface.** Fake accounts, collusion rings, gift loops, self-following,
   automation. `lib/cp-economics.ts` models this — assess whether the model
   reflects reality or flatters it.
7. **Scale.** What breaks first at 10×, 100×, 1000× — technically and
   operationally? Name the component.
8. **Data integrity and privacy.** Linked game accounts, Discord identities,
   payout preferences. What is stored that should not be?
9. **Test coverage.** What is dangerous and untested?

### PART B — Financial and unit economics

10. **Rebuild the unit economics from scratch.** Do not check their arithmetic —
    do it yourself and compare. State where you differ and why.
11. **Attack the $5 CPM.** Is it achievable for an unproven Discord-native format
    with no viewability measurement? What would a real media buyer pay? What
    happens to the model at the price you believe is real?
12. **Attack the 15 screens.** Is it plausible that a gamer opens 15 screens a
    day for 5 cents? What is the real distribution likely to be?
13. **Attack the willingness to pay.** Will a gamer do 20 things for $0.05?
    What does that imply about churn, and what does churn do to the model?
14. **Fill rate.** The model needs inventory sold. Assess the sales effort
    implied at each scale. Is 100 brands at 1M gamers credible?
15. **Redemption.** The model assumes CP is a liability only when redeemed. What
    if redemption is 100%? What if a redemption rush happens?
16. **Sensitivity.** Which single variable, moved 20%, does the most damage?
    Build the table.
17. **Breakeven.** How many gamers and brands, and how long, before the company
    is cash-positive? What does it cost to get there?

### PART C — Legal, regulatory, platform risk

18. **Is paying users cash for engagement a regulated activity** in the US, UK,
    EU, or the Gulf? Money transmission, gambling, tax reporting, minors.
    **The founders flag this as unassessed (A8). Assess it.**
19. **Does this violate Discord's Developer Terms of Service or Platform
    Policy?** Incentivised engagement, automated posting, ad content inside a
    bot. **A single policy decision by Discord could end this company. (A7)**
20. **Advertising standards.** Incentivised impressions and clicks — disclosure,
    IAB standards, what a brand's agency would say.
21. **Minors.** Gaming communities skew young. Paying minors. COPPA/GDPR-K.

### PART D — Verdict

22. **The three things most likely to kill this company**, ranked, with your
    reasoning.
23. **What would have to be true** for the model to work as written.
24. **What you would demand** before investing: proof, changes, or terms.
25. **Your recommendation**, stated plainly.

---

## Rules for your report

- **Fact-check before you assert.** Cite `file:line` for every technical claim.
  A confident wrong finding is worse than a hedged right one.
- **Separate three things clearly**: what is *broken* (verified), what is
  *unproven* (assumption), what is *risk* (outside their control).
- **Quantify.** "This is risky" is worthless. "At 40% fill this loses $18k/month
  at 10k gamers" is a finding.
- **Be blunt.** No diplomacy, no sandwiching. The reader is deciding whether to
  wire money.
- **Where they are right, say so** — and say what you tried in order to prove
  them wrong. That is the most valuable sentence in any DD report.
- **Do not fix anything.** Do not write code. You are assessing, not building.

---

## Deliverable

Write **`docs/DUE_DILIGENCE_REPORT.md`** and commit it to the branch
`claude/clustergg-platform-build-mfkzaa`.

Structure it:

1. **Verdict** — one page. Recommendation first.
2. **Fatal risks** — anything that could end the company.
3. **Technical findings** — with file:line.
4. **Financial findings** — with your own model, not theirs.
5. **Legal and platform findings.**
6. **What they got right, and what you tried to break it with.**
7. **Conditions for investment.**
8. **Appendix** — your workings, so they can be checked.

Take the time it needs. Read the code before you form a view. This is a
multi-million-dollar decision and the report is the product.
