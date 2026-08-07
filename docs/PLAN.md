# ClusterGG — The Live Plan

**Updated 7 August 2026, after four owner decisions were made.** This is the
whole remaining build, in order, with the gates that stop it.

The 4,700-line `docs/EXECUTION_PLAN.md` is the *record* — every decision and
every correction since the beginning. This file is the *plan*: what is left, why
it is in this order, and where we know we are weak. A reader should not have to
reconstruct the present from an archive.

---

## READ THIS FIRST — what we want from you

**You are being asked to attack this plan.**

If you are the independent reviewer who wrote `docs/DUE_DILIGENCE_REPORT.md` and
the two rounds of `docs/DD_RESPONSE_REVIEW.md`: every round you have written has
been right and has changed what we build. Round 1 killed a business model.
Round 2 found an arithmetic error inside the very dispute where we claimed to
understand round 1, and then found a bug our own fix had introduced. Keep that
standard. Nothing here is written to survive you.

If you are new: read `docs/DUE_DILIGENCE_REPORT.md` (the kill verdict),
`docs/DD_RESPONSE.md` (our reply), then `docs/DD_RESPONSE_REVIEW.md` (both
rounds of review). Then this. **Do not take a claim in this file on trust** —
several claims in our documents have been wrong, and every single one was caught
by someone reading the source instead of the prose.

**What is most useful to us, in order:**

1. **Break something specific.** A finding with a `file:line` beats a paragraph
   of concern. If a step is out of order, unnecessary, or quietly depends on
   something that does not exist, name it and name the dependency.
2. **Where we could do better, give us 2 or 3 REAL PATHS — not one
   recommendation.** Name the trade-off on each, say which you would take and
   why, and say what would make you switch. One recommendation is easy to accept
   without thinking. Three force a choice, and the choosing is where we find out
   what we actually believe. We would rather have your second-best option written
   down than never know it existed.
3. **Tell us what we are not asking.** The expensive mistakes here were never
   wrong answers. They were questions nobody put on the list — Discord's policy,
   money transmission, a fill rate missing from an equation — and each time the
   plan looked complete right up until someone read it who had not written it.
4. **Say plainly where we are still fooling ourselves.** Better here than from a
   brand, a regulator, or Discord.

**Attack §3 hardest.** It is the new measurement design, it is the direct
successor to the fabricated ROAS you killed, and it contains an estimate. An
estimate is exactly how the last lie started.

You do not need to be balanced. If a section is wrong, say it is wrong.

---

## 1. Where we are

### Fixed and merged to `main` (live)

| Commit | What |
|---|---|
| `3a776c0` | `AUTH_SECRET` fails closed outside a demo runtime. Self-serve creative uploads insert `pending_review`, so both portal paths go through the review queue that already existed. `getCardCampaign.live` now checks creative approval, which it claimed to and did not — the portal shows **In review** instead of telling a brand "You're live" while nothing serves. |
| `a6972d3` | **Money integrity.** `lib/db/tx.ts` opens a pooled connection — the only place a transaction is possible, since `neon-http` cannot open one. The CP ceiling, `buyTrophy` and `requestRedeem` run inside a transaction behind `SELECT … FOR UPDATE` on the gamer's row. The bare `catch {}` is gone. First CI this repository has ever had. |
| `12c4730` | The three round-2 findings. Real Postgres in CI so the lock is genuinely contended; `engines`/`.nvmrc`/`ws` fallback so a runtime downgrade cannot silently stop all CP earning; and the client-bundle break that adding `pg` caused. |

**The lock is proven, not asserted.** With `FOR UPDATE` removed and the suite run
against real Postgres, three assertions fail — including *four simultaneous
claims on one trophy all succeeding*, which is one trophy paid out three times in
dollars. Put the lock back and it is one.

*Honest limit:* the five-way `buyTrophy` race did **not** fail in that control
run, so that assertion is not yet demonstrated to exercise contention. Recorded
in the test file rather than counted as proven.

### Still live, still wrong

Four Phase-0 defects. Until this week all four were blocked on decisions. **All
four are now unblocked** by §2 and are the top of the build queue.

| Live defect | Where |
|---|---|
| Fabricated ROAS shown to a paying brand | `lib/brand-report.ts:105-115` |
| Ad beacon is unauthenticated — CP mintable with `curl` | `app/api/ads/beacon/route.ts` |
| Trophy gifting (money-transmission trigger) | `lib/marketplace.ts:198-217` |
| No age gate at signup | `app/actions/auth.ts:11-53` |

---

## 2. The four decisions, made

These were the open questions in the previous version of this file. The owner has
answered all four. Everything in §3 onward follows from them.

### D1 + D4 — What an ad view IS, and what the brand sees

**Decided.** A campaign runs on **both** surfaces by default: the website and the
Discord cards. The unit we sell and report is **a card the bot drew carrying that
brand's creative**, plus website placement views.

| Surface | What one render counts as | Counted or estimated |
|---|---|---|
| **Private bot card** (ephemeral — only the person who clicked sees it) | **1 view.** Four button presses is four cards is four views. | **COUNTED** |
| **Public bot message** (challenge reminder, profile of the week, a gamer sharing their card into a channel) | **5% of that server's member count**, deliberately conservative | **ESTIMATED** |
| **Website placement** | As today | **COUNTED** |

**The non-negotiable constraint on this, and the reason §3 exists at all:**
counted and estimated are **never added into one number**. The fabricated ROAS
died because a computed figure was labelled "Counted delivery". A 5% assumption
presented as delivery is the identical error wearing better arithmetic. The brand
report shows two lines, always, with the method stated on the estimated one.

The brand also gets, broken down:

- **Discord:** by **card kind** and by **server**. Which cards carried them, where.
- **Website:** by placement — count and traffic, which already exists.
- **Audience composition (new):** of the people who saw it, what do they play?
  *"62% have a League of Legends account, 48% Fortnite, 30% Valorant."* Overlapping
  by design — one gamer can hold several accounts — so the percentages will sum
  past 100% and the report must say so, or it looks broken.

### D2 — Gifting is deleted

**Decided: delete it entirely.** Not disabled, not restricted — removed.

- The gift option in the marketplace checkout
- The search-for-a-gamer-to-gift flow
- Every gifting button on Discord cards
- The `gift_sent` / `gift_received` quest actions
- The gift notification, the gift order kind, the recipient column's *use*

**A gamer can only buy a trophy for themselves. Nothing transfers between
accounts, ever.** That single sentence is the design.

This is the highest-leverage fix in the entire report: it closes the FinCEN
money-transmission trigger, the 1099 aggregation hole, and the under-18 cash-out
bypass simultaneously.

**The consequence nobody had spotted:** two of the four Daily Mission templates
are built on gifting (`lib/missions.ts:88,103`, 50 CP each). Deleting the actions
breaks their arithmetic. Rebuilding them is part of the item, not a follow-up.

### D3 — Age range, never a date of birth

**Decided.** We do not want anybody's birthday. We want one fact: *are we allowed
to pay this person.*

- **Three buttons, an age range.** Not a date picker, not a year.
- **Two places:** the new-gamer onboarding page, and the profile customization
  page next to flag, country, currency and payout preference — where a gamer
  already tells us who they are.
- **Existing accounts:** the option appears on their profile page, and on the
  onboarding screen if they sign in again.
- **Presented as a friendly "complete your profile" checklist** with a red dot —
  link a game account, pick a flag, set your age range. Smooth. Not invasive.
  Not a wall.

> **⚠️ Our one addition, flagged for the owner to overrule.** "Not forced" leaves
> the hole half-open: a gamer who skips it is still an unknown age, which is
> exactly what a regulator asks about. Our proposal keeps the decision intact —
> **anyone can browse, play, link accounts and use the entire platform without
> answering. Earning CP does not begin until they do.** One friendly line:
> *"Tell us your age range to start earning."* No birthday, no pressure to
> browse, and the hole closes. **Built this way unless overruled.**

---

## 3. THE BUILD

In order. An item does not start before the one above it lands, except where
marked parallel.

---

### ▸ B72 — Stop the bleeding *(4 items remain)*

Live defects with a live customer or a live legal exposure. Nothing else moves
around these.

#### B72.1 — Kill the fabricated ROAS *(unblocked by D1)*

`mediaValue` is computed from **server headcount** and labelled "Counted
delivery". It is a false statement to a paying customer and it is live now.

Remove it from every surface it reaches:

- `lib/brand-report.ts:105-120` — the `mediaValue` / `roasOf` functions
- `components/BrandCampaignReports.tsx:115` — the "2.4×" hero figure
- `components/BrandCampaignReports.tsx:288` — "Return on spend"
- `components/BrandCampaignReports.tsx:369` — "Media value delivered"
- `app/api/brands/report/route.ts:60-67` — the CSV export columns

Until B81 lands, the panel says **"Delivery measurement is being rebuilt — see
your placement counts below."** A blank honest box beats a confident wrong one.

`PRICING_DEFAULTS.benchmarkCpe` stays in the code: it is the CPA product B79
tests, and it is not what was being misrepresented.

**Verification owed → `tests/db/integrity.mts`:** no field reachable from the
brand report is derived from a member count; the strings "Return on spend" and
"Media value" appear nowhere in a brand-facing component.

#### B72.2 — Close the beacon

Not one hole. Reading `app/api/ads/beacon/route.ts` end to end there are three:

1. The impression branch awards CP for any `ccId` posted by anyone (`:37`).
2. The `duration` branch updates **any** impression id, with no ownership check (`:41`).
3. Separately, `profile_views_25` is credited from an unauthenticated public page
   render (`app/u/[slug]/page.tsx:96-102`) — a second mint the beacon fix does
   not touch.

A browser-callable beacon cannot hold a shared secret, so "authenticate it" is
not a design. **The design: a server-issued, single-use nonce, minted when the ad
is rendered, bound to the session and the campaign-creative, redeemed exactly
once, expiring in minutes.** Rate-limited and origin-checked on top.

**Verification owed → `tests/db/integrity.mts`:** an unsigned call awards nothing;
a replayed nonce awards nothing; a nonce for another session awards nothing; the
duration branch refuses an impression the caller does not own.

#### B72.3 — Delete gifting *(D2)*

Every trace. Touches 12 files: `lib/marketplace.ts`, `app/actions/marketplace.ts`,
`components/TrophyCheckout.tsx`, `app/api/discord/interactions/route.ts`,
`lib/quests.ts` (the two actions), `lib/missions.ts` (the two templates),
`lib/wallet.ts`, `app/admin/marketplace/page.tsx`, `lib/db/seed-activity.ts`,
`app/actions/admin-email.ts`, `components/AdminEmailCompose.tsx`, and the schema.

Rules:

- `buyTrophy` loses its `recipientSlug` / `message` options entirely.
- `marketplaceOrders.recipientId` **stays as a column** (historical orders
  reference it and deleting it destroys the ledger) but is always the buyer.
  `kind` is always `"self"`.
- `gift_sent` / `gift_received` go to weight 0 like the retired social actions —
  **kept, not deleted**, so a stored admin weight naming one reads zero instead
  of throwing. Same pattern B61 used for posts and comments.
- **Missions 2 and 4 are rebuilt.** Orbit still has the room: `share_card`
  (25×3), `profile_views_25` (25×3), `follower_gained` (25×2),
  `profile_vote_received` (25×2). Both blocks must still total exactly 125.
- `tests/db/missions.mts:90-92` asserts gifts exist and are symmetric. It goes
  red **on purpose** and is rewritten to assert the opposite.

**Verification owed → `tests/db/gifting.mts` (rewritten):** no code path can
create a `userTrophies` row for a user other than the buyer; every mission
variation still totals 500 and 125 per quest; no gift UI string survives.

#### B72.4 — Age range at onboarding *(D3)*

- `users.ageBand` — an enum, not a date. Three values plus unset.
- Onboarding page: three buttons, part of the "complete your profile" checklist.
- Profile customization page: the same control, beside flag / country / currency
  / payout preference.
- Existing accounts: the control appears on their profile, and on the onboarding
  screen at next sign-in. A red dot on the profile nav until the checklist is done.
- **Earning is gated on it** (see the flagged addition in §2 D3). Browsing,
  playing, linking accounts and everything else are not.
- The existing cash-out eligibility check (`lib/eligibility.ts`) reads the band
  instead of computing an age from a birthday. **The `birthDate` column stops
  being collected** — and B80's purge job deletes what is already stored.

**Verification owed → `tests/db/eligibility.mts`:** an unset band earns nothing
and cashes out nothing; an under-band cashes out nothing; nothing anywhere asks
for a date of birth.

**Gate 0: none of B72 may be deferred for a feature.** They are the difference
between "early" and "misleading".

---

### ▸ B73 — The two questions that decide whether the business exists

**Owner is doing this now. It is not an engineering task.**

| Question | What we need back |
|---|---|
| **Does Discord permit this?** Third-party paid creatives inside bot messages; cash-convertible points paid for engagement; verification at 100 servers forces a human review of exactly this. | A written read of the Developer Policy. If no: a partner conversation, or a product that does not put paid creatives inside bot messages. |
| **Is paying cash for engagement regulated?** FinCEN CVC administrator status, state money-transmitter licensing, sanctions screening, 1099 thresholds. | A status opinion. **B72.3 deletes gifting specifically so this opinion can come back "no."** |

**Gate 1.** If Discord says no, the ad business inside Discord ends and the
company is the sponsored-challenge business only.

> **The reviewer's fair shot, accepted:** this gate cannot be enforced in code,
> which makes it the one that most needs to be *evidentiary*. It is not satisfied
> by having asked. **It is satisfied when a dated written opinion is committed to
> this repository and referenced by name here.** A gate whose state cannot be
> observed is a hope.
>
> Also accepted: our own plan said "B74 through B79 do not start before this
> answer," and B74 started and shipped. Money integrity is worth doing whatever
> Discord says — but the first thing we built crossed our own most important
> gate, and that is worth naming rather than explaining away.

---

### ▸ B74 — Money integrity ✅ **DONE**

Shipped and merged. Gate 2's evidence is real: the lock is empirically contended
against a real Postgres in CI, and the suite fails when the lock is removed.

**Still owed to close it:** a branch-protection rule requiring the check.
**Owner is doing this now.** Until then CI reports; it does not block.

---

### ▸ B81 — Ad view counting: the measurement layer *(NEW — D1/D4)*

**This is the item the whole revenue model rests on, and it must be built before
anything that counts, prices, paces or reports delivery.** We do not build a
delivery counter on a unit we have not defined.

#### B81.1 — Write the definition down

A short, plain document — `docs/AD_VIEW.md` — that a brand's agency could read:

- What a private card render is, and why it is one view
- What a public post is, and that its number is **an estimate at 5% of member
  count**, why we chose 5%, and that we would rather understate
- That neither is an IAB viewable impression, and we do not claim it is
- What we cannot see: whether the person scrolled past, how long it was on screen

**If we cannot write it honestly, we cannot sell it.**

#### B81.2 — Log a render as an ad view

Every card the bot draws carrying a brand creative writes one row.

`ad_impressions` already has `guildId` (`schema.ts:556`). It gains:

| Column | Why |
|---|---|
| `surface` | `discord_private` / `discord_public` / `web` |
| `cardKind` | profile, challenge, planet, game-stats, market… — the brand asked for this breakdown |
| `views` | `1` for a private card or a web slot; the computed number for a public post |
| `estimated` | **boolean.** The flag that keeps `sum(views) where estimated = false` an honest sentence forever. |
| `audienceSize` | the server's member count at the time, so the estimate is auditable and re-computable if the 5% ever changes |

`cardRenders` (`schema.ts:1381`) already carries `kind` and `hits` — the render
path is where this hooks in. The private/public distinction is already available:
the bot marks ephemeral replies with `flags: 64`.

**The 5% is a setting, not a constant.** `platform_settings` key
`ads.publicReachPercent`, admin-editable, versioned — because the day we measure
it for real, every historical row must remain re-computable from
`audienceSize`.

#### B81.3 — Never blend the two numbers

One rule, enforced by a test rather than by discipline: **any brand-facing total
is either counted-only, or explicitly split.** No function returns a single
number that mixes them.

**Verification owed → `tests/db/ad-views.mts` (new):** a private card logs
exactly 1 view, estimated false; a public post logs `round(members × pct)`,
estimated true; changing the percentage re-computes historical estimates from
`audienceSize` and leaves counted rows untouched; **no exported report function
returns a total that mixes estimated and counted rows**; a cached card re-served
does not double-count, and does not skip a count.

---

### ▸ B82 — What the brand actually sees *(NEW — D1)*

Only after B81. The report is a view over logged rows and contains no arithmetic
the rows do not support.

#### B82.1 — The headline

```
Ad views delivered          8,412     ← counted. Cards we drew, one per person.
Estimated additional reach  12,050    ← public posts, 5% of server members
```

Two lines, with a plain-English note under the second explaining the method and
that we would rather understate.

#### B82.2 — Discord breakdown

- **By card kind** — a table: profile 3,201 · challenge 2,890 · planet 1,504 …
- **By server** — with each server's name, member count, and the counted/estimated
  split for that server
- Public vs private clearly separated in both

#### B82.3 — Website breakdown

Per placement — count and traffic. This largely exists; it gets the same
counted/estimated labelling for consistency, even though everything on the web
side is counted.

#### B82.4 — Audience composition *(new capability)*

Of the gamers who saw this brand's creative, what do they play?

> 62% League of Legends · 48% Fortnite · 30% Valorant
> *A gamer can link several accounts, so these add to more than 100%.*

Built from `linkedAccounts` joined to the viewers on the logged impressions.
Only for `userId`-attributed rows — an anonymous web view has no games, and the
denominator must say so rather than quietly shrinking.

**Privacy bound, non-negotiable:** aggregate only. Minimum cohort size before a
percentage is shown at all (proposed: 25 viewers), so a brand can never
re-identify a person from a small server. **No brand, no server owner and no
staff department ever reaches a gamer's identity through this report** — the
existing rule that `/admin/users` and `/admin/linked-accounts` are admin-only
applies here with no exception.

**Verification owed → `tests/db/brand-report.mts` (new):** every number on the
report traces to logged rows; a cohort under the minimum shows a suppressed
label, never a percentage; the composition percentages are allowed to exceed
100% and the copy says why; no brand-facing query can return a user id, name,
slug or handle.

**Registered as an admin system in `lib/systems.ts`, assignable to a
department (B29).** Nothing ships that admin cannot edit.

---

### ▸ B75 — Deliver what was sold

Now, and only now, that a view is defined and logged.

1. **Target and delivered per campaign.** `cpm` and `viewsTarget` on the campaign
   so a floor price is enforceable by the system, not by an email.
2. **Pacing** — spread delivery across the flight instead of burning it in a day.
3. **Stop at target.** A campaign that has delivered what it sold stops.
4. **Frequency cap** — one gamer does not see one brand forty times.
5. **No silent cutoff (B65).** `maxCreativesInRotation` currently drops paying
   brands with no warning, and the bot-post surface serves `creatives[0]` only.
   Both are money we took for delivery we did not make.
6. **Cache/ad separation.** A cached card must not re-serve one brand's creative
   or skip its count.
7. **Under-delivery has a remedy in the system** — make-good or credit — not in
   an apology email.

**Verification owed → `tests/db/ad-delivery.mts` (new):** a campaign at target
serves nothing further; every active creative appears in rotation; a frequency
cap holds per gamer per day; under-delivery produces a credit row.

---

### ▸ B76 — Make the 15-screen guarantee real

`COMMERCIAL_MODEL.md` §2 claims a floor the code does not implement. Every item
here is a gap between a document and the source.

- **Four priced actions have no emitter.** `stat_levelup`, `play_session`,
  `challenge_progress`, `share_card` are in every mission variation and **nothing
  fires them.** Build the emitters.
- **`lib/missions.ts` is imported by nothing but its own test.** Wire it to a
  surface. A model with no caller is a document, not a feature.
- **The passive cap.** The active/passive flag and the 125 CP passive ceiling the
  model claims do not exist in `lib/quests.ts`. Implement, or delete the claim.
- **The 25-CP rule.** `win_challenge` at 100 and `best_profile_award` at 100 break
  the bound the guarantee rests on. Enforce it, or restate the guarantee to
  exclude them and show the resulting floor honestly.
- **Log over-cap actions** with "max CP for today reached" — decided long ago,
  still owed.

**Verification owed → `tests/db/quests.mts`:** every priced action has an emitter,
asserted by scanning the callers of `awardQuestAction` rather than the catalogue
— *the exact mistake that let missions ship on actions that do not fire*; no
action exceeds 25; the passive subtotal cannot exceed 125 in a day.

---

### ▸ B77 — The caps our own cost control set

`lib/cards/budget.ts:22` caps rendering at 4,000 renders a day — roughly 200
active gamers. B46 set it as a spend control without checking it against the
growth the commercial model assumes. Two of our own documents contradicted each
other and nobody noticed.

- Raise or scale it against the ladder, **and model the render cost first** —
  raising it re-opens the cost it was capping, which nobody has quantified.
- Make the ceiling a **configured, admin-visible number**, not a constant.
- Consider raising it only for instrumented cohorts, so B79's measurement can
  happen without a network-wide bill.

---

### ▸ B78 — The model, restated honestly

- `revenue = screens × CPM/1000 × fill`. **Fill was missing from our break-even
  and that is our error, not a dispute.**
- Every rung of the ladder declares **registered vs daily-active**. The reviewer's
  0.51 screens/gamer/day divides by registered accounts; ours divided by
  daily-active. That switch alone is worth ~30× and our table never said which.
- Cost and revenue use the **same** engagement assumption, in the same paragraph.
- `COMMERCIAL_MODEL.md` gains a **CURRENT STATE vs TARGET STATE** header, and
  every unbuilt mechanism is marked **NOT BUILT**. It was written in the present
  tense for a backlog and a reader with no context reasonably read it as shipped.
- **Restate the whole model on the D1 view definition** — counted views, not
  hypothetical screens — because that is now the thing we actually sell.

---

### ▸ B79 — Earn the right to sell

- **Instrument three numbers** and stop arguing about them: real counted views per
  daily-active gamer per day, real fill against a signed brand, real mission
  time-on-task.
- **Test the CPA product.** Price on verified entrants rather than views —
  `benchmarkCpe = $3.50` carries roughly 70× the headroom of a display view.

**Gate 4 — one signed insertion order** before **B66** (admin sales console),
**B67** (brand portal rebuild) and **B69** (public commercial site).

> **Two things the reviewer got right that we still cannot fully answer.**
>
> **A gate cannot block the past.** `app/brands/[slug]`, `app/pricing`,
> `app/brands`, `app/servers` and `app/discord-bot` are already built and live.
> Gating the *start* of work that shipped months ago is meaningless. To make
> Gate 4 real, the already-live commercial surfaces go behind a flag that is off
> until an IO exists, or they come down. **Undecided. We want paths.**
>
> **Gate 4 is circular.** B79 measures fill "against a signed brand", and the
> signed brand *is* Gate 4. The measurement meant to justify the first sale can
> only be taken after it. The only escape we see is selling the first IO
> explicitly as an unmeasured pilot priced on outcomes — which contradicts
> `COMMERCIAL_MODEL.md` §7.2's promise of numbers "computed from the real
> platform right now". **We want paths on this too.**

---

### ▸ B80 — The debt, restated in full

**This section was wrong before and is corrected here.** It previously said "the
remainder of the report's verified findings, none fatal alone" and listed five
items. It was not the remainder, and it silently contained findings the reviewer
rated **fatal**.

#### Abuse and identity — the omission that matters most

- **Sybil cost per account is $0.00.** No email verification, no captcha, no
  phone, no device check; the IP-velocity guard is dead code. *(fatal)*
- **No automated gamer-side abuse detection.** The only detector is guild-scoped,
  needs 50+ members, and does not enforce. *(severe)*

> **Why this is worse than the tally suggests:** the **$547,500/yr minted-CP
> fraud figure comes from free account creation × a public mint.** B72.2 closes
> the mint. It does nothing about free account creation, and nothing about
> collusion rings farming follows, votes and profile views, which need no beacon
> at all. **The fraud economics survive our own Phase-0 fix.**

#### Scale — the category that went missing

- Cold-start DDL replay: 219 raw statements, 108 `ALTER TABLE` (ACCESS
  EXCLUSIVE), 11 full-table `UPDATE`, on every cold boot against production. *(fatal)*
- Stat sync saturates at ~30 accounts — 60/hr sequential loop, no queue. *(fatal)*
- Per-award query cost: ~12 round-trips × 20 actions × 1M gamers = 240M
  queries/day; `quest_events` and `ad_impressions` unbounded and unpartitioned. *(fatal)*
- Brand report loads every impression row into function heap. *(severe)*
  **B82 must not repeat this** — the new report is aggregate queries, not a heap load.

> **The tension we have not resolved, stated rather than hidden:** these are only
> deferrable if our honest position is "pre-revenue, scale is years away". But
> then the 1,000,000-gamer ladder in `COMMERCIAL_MODEL.md` cannot also be the
> reference model B78 restates. **We cannot drop the scale findings as premature
> while keeping the 1M-gamer ladder as the plan of record.** One has to give and
> we want a view on which.

#### Access and privacy

- `/api/setup` is public when `SETUP_TOKEN` is unset; the first account becomes
  superadmin.
- OAuth open redirect (`next` unvalidated); account-merge trusts an unverified
  provider email.
- Portal brute-force lockout is per-portal, not per-IP — a denial-of-service on
  every brand and server customer.
- Session JWT last-16-chars stored in an analytics table, plaintext, indefinitely.
- Open image proxy (`next.config.ts` proxies any HTTPS host).
- The privacy policy promises a 90-day purge the product does not perform.
  **This job now also deletes stored `birthDate` values (D3).**
- Riot **development** key on a live product whose terms prohibit contests.
- Cookie consent is decorative; deletion leaves PII; the IP salt defaults.

---

### ▸ Carried over — real work, not lost, but behind the gates

| Item | What |
|---|---|
| **B62** (web half) | Trophy stacking and no-price-on-your-own-case on `components/TrophyCase.tsx`. The card half shipped. |
| **B63** | The nav bands: today's mission and the streak; both on the nav's background art; the week band's profiles become their cards. |
| **B59** | A gamer can see and control their own card, on the website. |
| **B56** (remainder) | The card kinds not yet moved onto the new shared layout. |
| **B68** | The social purge — posts, comments, reactions leave the product. Quest actions already retired to weight 0. |
| **B66, B67, B69** | Admin sales console, brand portal rebuild, public commercial site — **behind Gate 4**. |
| **B70** | Component screenshots from seeded demo data. |
| `tests/ui/cards.mjs` | Owed since B54 and still owed. |

---

## 4. The gates, honestly scored

We keep this table in this shape on purpose: the answer must always be
**observable**, never asserted.

| Gate | Blocks | Enforced by | Real? |
|---|---|---|---|
| **0** | Everything, until the six Phase-0 defects are fixed | `tests/db/integrity.mts` in CI — 2 of 6 today, **and the two least severe** | **1/3** — the reviewer's score, and it is the right one |
| **1** | B75–B79, until Discord and FinCEN answer | Nothing yet. Needs a **committed, dated written opinion** | **No — owner is doing it now** |
| **2** | Any CP feature, until the ceiling holds under parallel writes | `tests/db/concurrency.mts`, two CI steps — PGlite *and* a real Postgres with pooled connections; **fails when the lock is removed** | **Evidence: yes. Blocking: not until branch protection — owner is doing it now** |
| **4** | B66, B67, B69, until one signed IO | Nothing, **and two of the three already shipped** | **No** |

---

## 5. What we are not doing, and why

| Not doing | Why |
|---|---|
| Defending the $5 CPM | We cannot prove it. A signed deal proves it or kills it — and even then it proves one deal, revocable if a verification vendor classifies our traffic as incentivised. |
| Building the sales console, brand portal or admin rebuild now | They serve a revenue model that has not cleared Gate 1. Building them first is the mistake the report is about. |
| Pivoting to CPA on paper | The strongest constructive idea in the report. A pivot announced without a signed deal is the same error in a new coat. |
| Chasing the 1,234× number | Three disputed inputs compounded — conceded by the reviewer without reservation. Real numbers arrive within a month of B79. |

---

## 6. The questions we most want answered

Ranked by how much the answer changes what we build next.

1. **Attack §3's measurement design.** The 5% public-reach estimate is the direct
   successor to the fabricated ROAS. We think splitting counted from estimated,
   with the method printed and the raw `audienceSize` stored, makes it honest.
   **Is that enough, or is any estimate on a delivery report a mistake?** Give us
   2–3 paths.
2. **Is 5% defensible at all?** We picked it to be conservative. What would a
   media buyer say — and is there a defensible way to measure real public-post
   reach on Discord, or is the honest answer "we cannot, so we do not sell it"?
3. **The age-range gate.** We propose earning-blocked-until-answered while
   browsing stays open. Does that close the COPPA exposure, or is an
   unverified self-declared band worth nothing legally?
4. **Gate 4 is circular and gates the past.** Two paths minimum, please.
5. **Scale vs the ladder.** Which gives: the 1M-gamer model, or the deferral of
   the fatal scale findings?
6. **What is missing from this document?** The pattern in this project is that
   the expensive things were never on the list.

---

*Everything here is checkable. If a claim in this file is not true in the code,
that is the most valuable thing you can tell us — and it has happened in every
round so far.*
