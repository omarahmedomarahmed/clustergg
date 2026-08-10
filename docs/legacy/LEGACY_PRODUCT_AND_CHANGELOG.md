# The product before this one, and the two pivots

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

Kept because the reasoning is still useful and because a decision with no record
gets made again. Nothing in this folder describes the product as it is now — for
that, read `docs/MODEL.md` and `README.md`.

---

## Version 1 — a Discord ad network

**What we were selling:** display inventory inside Discord. Ad placements in bot
messages, priced on a CPM, with reach counted from server member counts.

**The pitch:** gaming communities have enormous audiences and no way to make
money from them; we put a brand's creative in front of those audiences and split
the revenue with the server owner.

**What each party got:**

| | Then |
|---|---|
| Brand | Placements across the network, a CPM, reach reported from member counts |
| Server owner | A percentage of the ad revenue their server generated |
| Gamer | Profiles, stats and leaderboards; not paid |

**Why it died — three separate reasons, any one of which was enough:**

1. **The CPM was undefendable.** A $5 CPM against inventory that shrank the
   moment it was counted honestly. Member count is not reach; a bot message in a
   channel nobody reads is not an impression. A due-diligence review took the
   number apart and it did not survive.
2. **Reach was inferred, not counted.** Every number a brand would have been
   billed against was derived from things we did not observe.
3. **Discord Developer Policy §6.** A third-party brand's paid creative inside a
   bot message is probably prohibited outright. The research is in
   `docs/B73_RESEARCH.md`; the short version is that the ad business inside
   Discord may not have been legal to run at all.

**What survived:** the bot, the linked-game-account infrastructure, the
leaderboards, the profiles, and the delivery ledger — which was built to count
impressions honestly and now counts challenge announcements.

Original documents: `COMMERCIAL_MODEL.md`, `AD_VIEW.md`, `DUE_DILIGENCE_BRIEF.md`,
`DD_RESPONSE.md`, `DD_RESPONSE_REVIEW.md`.

---

## Version 2 — the sponsored challenge, four vaults

**The pivot:** stop selling attention, start selling a **competition**. A brand
funds a weekly challenge on a game; gamers who already play it enter; the brand's
name is on it and their trophy is on the winner's profile.

This is the change that made the business defensible. A challenge is a thing
both sides can count — entrants, completions, trophies awarded — and none of it
requires believing an impression happened.

**What it introduced, and all of it is still here:**

- **Four vaults**, no stored balances, every dollar summed from a ledger.
- **The prize vault as a liability**, because a trophy becomes cash only on
  redemption and some of it never will — which meant "50% goes to gamers" had to
  be measured rather than claimed.
- **Per-entrant server attribution.** One entrant used to count for every server
  they were in, so the shares summed past 100%.
- **A weekly close** — before it, the model was weekly and nothing ran weekly.

**What it got wrong, and what replaced it:**

| V2 said | Now |
|---|---|
| Owners take a per-challenge percentage rising in tiers at 500 / 1,000 / 5,000 | A **weekly pool**, scored and bracketed. The tier rate was deleted (C3) because running both paid an owner twice out of one line |
| A tier is a rate | A **bracket** is who you compete against, and nothing else |
| Prizes go to three winners | **1 to 10 places**; whoever bought the challenge decides |

Original document: `COMMERCIAL_MODEL_V2.md`.

---

## Version 3 — the campaign is the product (current)

**The pivot:** a brand does not buy a challenge, it buys a **campaign** — 1 to 4
consecutive weeks, one bill. Server owners are paid from a weekly pool rather
than a rate. Owners can spend what they earn on a private competition for their
own members. Every challenge climbs one five-rung ladder that everybody uses the
same words for.

The full record of what was built, in the order it was built, with what each
decision cost, is `docs/PLAN.md`. The current shape is `docs/MODEL.md`.

**The changes with the widest blast radius, for anybody reading the git history:**

| Change | What it broke and why it was worth it |
|---|---|
| **The status ladder** (`lib/challenge-stage.ts`) | Three screens had three vocabularies for one fact. Derived rather than stored, so it cannot drift from the row |
| **Announce before start** | Exposed a scoring bug that had been latent for months: the baseline was taken at join and never moved, so an early entrant was scored for a week they were not competing in |
| **Materialised series** | A repeating challenge used to be a chain — run 2 created when run 1 ended — so the month a brand bought did not exist yet and nobody could look at it |
| **Any-depth podium** | The award query was hard-coded to places 1, 2 and 3. A ten-winner deal handed out seven trophies by hand, off the books |
| **The weekly pool** | Replaced the per-challenge rate. Owner earnings became a share of what actually arrived rather than a percentage we invented |
| **The wallet** | Made a server owner's money a thing they can see, withdraw and spend, rather than a payout that appears |

---

## The purge, 9 August 2026

Every challenge and challenge request built under the old model was deleted from
production before the current one shipped — 6 challenges, 7 entrants, 72 events,
3 requests. Two were live at the time.

Trophies stayed on profiles (12, worth $475): `user_trophies.challenge_id` has no
foreign key, so nothing cascaded, and somebody who won something keeps it. Money
history stayed for the mirror reason. Campaign slots were reset rather than
deleted, so no brand lost what they bought.

Full record and the undo: `docs/PURGE_2026-08-09.md`.

---

## What is still open from the old work

Two reviews raised findings that the pivots did not answer, because they were
never about the commercial model:

- **Scale.** Cold-start DDL replay, stat sync saturating at ~30 accounts,
  unbounded event tables, a brand report that loads every impression row into
  memory. All identified, none fixed, all rated fatal by the reviewer.
- **Sybil defence.** Account creation costs nothing — no email verification, no
  captcha, no device check. Tolerable when nothing paid for growth; the weekly
  pool now pays cash for member counts.

Both are tracked in `docs/PLAN.md` under B80 and are the honest answer to "what
would break first".
