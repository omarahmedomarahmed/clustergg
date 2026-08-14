# The challenge

A challenge is one game, one week, one sponsor, one prize pool. Everything the
platform does exists to produce, run and settle one of these.

---

## 1 · Lifecycle

```
draft ──► pending_payment ──► scheduled ──► announced ──► live ──► ended
  │              │                │             │           │        │
brand or      bill made        paid, in     ADMIN        the gun   Friday
owner or                       the queue    PRESSES                00:00
admin                                       ANNOUNCE
```

| State | Meaning | Who moves it | Who can see it |
|---|---|---|---|
| `draft` | Being built. **No bill exists yet** | Brand · owner · admin | Admin (as *draft — unpaid*), and the buyer |
| `pending_payment` | Confirm & Pay pressed. **Bill created** | System | Admin, buyer |
| `scheduled` | **Paid.** In the admin queue for its week | Payment webhook | Admin, buyer |
| `announced` | Admin pressed Announce. **Joinable** | **Admin, by hand** | Everyone |
| `live` | The gun fired | System, at the gun | Everyone |
| `ended` | Placements final, trophies awarded | System, at the close | Everyone |

### The rules that govern the transitions

| # | Rule |
|---|---|
| L1 | **Nothing announces itself. Ever.** Announcement is always an admin click |
| L2 | Payment makes a challenge *eligible* to announce — not announced |
| L3 | **There can never be an announced challenge that is unpaid** |
| L4 | Before announcing, admin must have set: game, metrics, rules, trophies |
| L5 | The prize-pool guard must pass — trophy values equal the prize pool exactly |
| L6 | Start is **always the start of a week.** There is no date picker, anywhere, for anyone |
| L7 | Bought mid-week → next week, or any week after |
| L8 | A paid future challenge may be announced immediately. Gamers join now and score from the gun |
| L9 | **Every challenge has a bill** — to a brand, a server, or the Cluster house brand. There are no unbilled challenges |
| L10 | A **series** is several challenges. Each is announced individually, after its own payment clears |

### What admin sees at each stage

| Stage | Dashboard label |
|---|---|
| `draft` | *Draft — not yet eligible to announce. No bill.* |
| `pending_payment` | *Bill issued — awaiting payment* |
| `scheduled` | **Eligible to announce — needs setup** |
| Setup incomplete | *Metrics not set* · *Trophies not assigned* · *Prize pool mismatch* |
| Ready | **Announce** |
| `announced` | *Announced to N servers · X entrants* |
| `live` | *Live · day 3 of 5 · X entrants* |
| `ended` | *Closed · winners assigned · trophies delivered* |

---

## 2 · Baselining

This is the rule that took the longest to get right and it is the one most
likely to be built wrong. Read the failure cases before the rule.

### Why the obvious answers are both wrong

A gamer with one game account joins **Challenge A** during the week *before* it
starts, and **Challenge B** — a different brand, same game, same week — on day 2.

| Candidate rule | Challenge A | Challenge B | Verdict |
|---|---|---|---|
| Baseline when the **gamer joined** | Baselines a week early → a full week of play counts before the gun | Correct | ❌ scoring before the start |
| Baseline when the **challenge started** | Correct | Baselines at the gun, but they joined on day 2 → **they bank two days of play they made before entering** | ❌ exploitable: watch the standings, join on day 6 with six days already banked |

### The rule

```
baseline = max(challengeStart, joinedAt)
```

Stored **per (challenge, participant)** as a snapshot of the metric values at
that instant.

| Case | Baseline taken | Result |
|---|---|---|
| Joins before the gun | At the gun | Nothing from before the week counts |
| Joins on day 2 | At join | Nothing they played on days 1–2 counts |
| Joins in the final second | At join | Score ≈ 0, and they still get the participation trophy |

**Two challenges on one game account keep two independent baselines.** They never
interfere. The same account can be in any number of challenges at once.

### The operational rules that make it true

| # | Rule |
|---|---|
| B1 | **Force a sync on join** and stamp the baseline from that result. A stale reading becomes free progress |
| B2 | A **start-of-week job stamps baselines** for everyone who joined early. The gun is a real event, not a computed offset |
| B3 | A **final sync runs before the close**. Placements are never computed on stale data |
| B4 | Late joiners are disadvantaged, and the card says so: *"Scoring starts now. 2 days left."* |
| B5 | Gamers may join **until the final second** of the week |
| B6 | If a gamer unlinks the account they entered with, **freeze their score at the last sync** and keep them in the standings |

---

## 3 · Scoring

```
points = (Δwins × 10) + (Δmatches × 1)
```

| # | Rule |
|---|---|
| S1 | Wins and matches, **counted**. No win rate, no percentages, no ratios |
| S2 | Every delta is clamped `≥ 0`. A decline never subtracts |
| S3 | Ties are effectively impossible, so **there is no tiebreak rule** |
| S4 | **Matches played is always counted and always shown** on standings, whether or not it is scored |
| S5 | For League both come from one call: `league-v4 entries by-puuid` returns `wins` and `losses` per queue, so `matches = wins + losses` |

**Accepted consequence:** this rewards volume. A player at 50% over 40 games
beats a player at 70% over 20. That is deliberate — grinding is a legitimate way
to win a week-long competition, and it is unfakeable.

### League specifics

| Concern | Handling |
|---|---|
| Queue | A **per-challenge setting**: solo/duo, flex, or both |
| Unranked player | `league-v4` returns no entry. Resolve to **0, never null** — a null breaks the delta |
| **Season/split rollover** | Riot resets `wins` to 0 mid-week. A **decrease must trigger a re-baseline**, not a clamped-to-zero week that silently costs every League player their progress |
| Cost | One call per account per sync, at 20,000 per 10 seconds. Effectively free |

---

## 4 · Rank gating — optional, off by default

| # | Rule |
|---|---|
| R1 | A gate is a **range**: minimum tier and maximum tier |
| R2 | Checked **at join only.** Never re-checked — not at the gun, not at the close |
| R3 | Why: they will rank up during the week, and that is the point |
| R4 | Queue is selectable per challenge — solo/duo or flex |
| R5 | **Default is no gate.** Most challenges are open to everyone |
| R6 | Stated before joining: *"Gold I to Platinum IV, solo queue"* |
| R7 | An account outside the range is refused, with the reason and the numbers |
| R8 | **Ownership is checked before rank.** An unproven account never reaches the rank test |

---

## 5 · Entry

The guard chain, in order. Each returns before the next runs.

| # | Guard | Refusal |
|---|---|---|
| 1 | The challenge exists and is joinable | `not_found` |
| 2 | It is `announced` or `live` | `not_active` |
| 3 | Onboarding complete — account linked, age band, country | `onboarding` |
| 4 | Access key, if it is a community challenge | `locked` / `bad_key` |
| 5 | A linked account on the right provider | `no_account` |
| 6 | **Ownership proven — if the game's API supports proof** | `unproven` |
| 7 | Rank inside the range, if a gate is set | `rank_below` / `rank_above` |
| 8 | Not already entered on another account | `same_account` |

### Ownership

| # | Rule |
|---|---|
| O1 | Proof is **required** where the game's API supports it |
| O2 | Where it cannot, entry is allowed with an unproven account — **no badge, no warning, no second class** |
| O3 | It is not the gamer's fault the publisher has no endpoint, and they must not be punished for it |
| O4 | Whether a game requires proof is a **per-game flag**, visible to admin and to brands |

---

## 6 · Trophies

| Type | Value | Redeemable | Funded by | Awarded to |
|---|---|---|---|---|
| Sponsored podium | Set by admin | Yes, 18+ | Prize vault | Places 1–N |
| Sponsored participation | **$0** | **No** | Nothing | Every entrant who did not place |
| Milestone — 5 challenges in one game | **$0** | **No** | Nothing | Automatic, per game |
| Milestone — 4 consecutive weeks | **$0** | **No** | Nothing | Automatic, rolling |

| # | Rule |
|---|---|
| T1 | **Any $0 trophy is unredeemable.** Enforced at the redeem action, not merely hidden in the UI |
| T2 | **The sum of a challenge's podium trophy values must equal its prize pool.** Flag if over **and** if under |
| T3 | The participation trophy shows **once** on `/trophies` with a holder count — never one row per gamer |
| T4 | The challenge is created **first**; trophies are assigned after payment clears |
| T5 | A trophy's **value can never be edited**. Name, image and brand can, and an edit propagates to every holder everywhere |
| T6 | Trophies **lock at `ended`** |
| T7 | Milestone trophies show live progress: *"3 of 5 challenges in League"* |
| T8 | `/trophies` is a **showcase, not a shop.** Nothing is for sale |

### Trophy templates

Admin defines a trophy **once per place**; the system instantiates one per
challenge instance. Without this, a 7-day daily series would require hand-creating
21 trophies.

---

## 7 · Daily and repeating series — the operational guide

Admin can build a challenge that repeats daily and bill it to a brand. This is
the most intricate flow on the platform, so here it is end to end.

**Example: Brand X, League, 3 winners a day, 7 days.**

| Step | Who | Where | What happens |
|---|---|---|---|
| 1 | Admin | Challenge builder | Type **daily series**. Game: League. Days: 7. Start: Monday |
| 2 | Admin | Same | Winners per day: 3. Prize per place: $5 / $3 / $2 = **$10 a day** |
| 3 | System | Same | Series prize = $10 × 7 = **$70**. Bill = $70 ÷ 50% = **$140** |
| 4 | Admin | Same | Assign sponsor: Brand X. Save as **draft** |
| 5 | Brand | Their portal | Sees the draft. May change **the start day only**. Confirm & Pay $140 |
| 6 | System | — | Paid → vault 1 → prize **$70**, server **$35**, Cluster **$35** |
| 7 | System | — | Creates **7 challenge instances**, one per day |
| 8 | Admin | Trophy assign | Defines **3 trophy templates** ($5/$3/$2, Brand X). System instantiates 21 |
| 9 | System | — | **Guard:** 21 trophies × values = $70 = prize allocation ✓ |
| 10 | Admin | — | Sets metrics once; applies to all 7 |
| 11 | Admin | — | **Announce the series** — one click, 7 challenges |
| 12 | Daily | System | Each day: gun at 00:00 UTC, close at 23:59, trophies land |

### The arithmetic, stated once

```
bill = (prize per day × number of days) ÷ 0.5
```

Because the prize is 50% of a challenge's price. Admin enters the **prize** and
the system computes the **bill** — never the other way round, or the split drifts.

### The holes, and how they close

| Hole | Rule |
|---|---|
| Admin hand-creating 21 trophies | **Trophy templates.** Define per place, instantiate per instance |
| Brand pays late | The **whole series shifts**. Never a partial start |
| A day is cancelled mid-series | Refund that day's prize from unallocated funds. Completed days stand |
| Daily runs during a sponsored week | Allowed. Dailies are custom or house; the weekly is the brand product |
| Brand tries to edit the series | They may change **the start day only** |

### Who can build what

| Builder | Weekly | Daily | Custom prize | Date choice |
|---|---|---|---|---|
| Brand, self-serve | ✅ | ❌ | ❌ — always $350 | Which **week** |
| Server owner | ✅ | ✅ | ❌ — $5 or $10 tiers | Which **week or day** |
| **Admin** | ✅ | ✅ | ✅ | ✅ |

Admin may create a challenge billed to any brand, any server, or the Cluster
house brand — including a draft that appears in a brand's portal ready for them
to confirm and pay.

---

## 8 · When a week goes wrong

| Situation | What happens |
|---|---|
| **Provider API outage** | Push the challenge to next week. **Same entrants stay joined**, all their scores in this challenge reset, state goes back to `announced`. Keep pushing week by week until the provider returns. Only if that becomes untenable: cancel and refund |
| **Zero entrants by Monday** | Remove from live, push to next week as `announced`, back into the queue. The start date moves and there is more time to gather entrants |
| **Bot removed from a server mid-week** | Entrants already counted stay counted. The server keeps its earnings. Reach freezes at removal. Re-announce errors say *"tell your admin to reinstall Cluster"*. Reinstalling resumes everything — the portal was never deleted |
| **A gamer unlinks mid-challenge** | Score freezes at the last sync. They stay in the standings |
| **Season rollover mid-week** | Detected as a decrease. Re-baseline rather than clamping the week to zero |

---

## 9 · The close

| Order | Step |
|---|---|
| 1 | **Final sync** — every participating account |
| 2 | Compute placements from each participant's own baseline |
| 3 | Award podium trophies to winners |
| 4 | Award the $0 participation trophy to every other entrant |
| 5 | Compute rank movement for **every** entrant |
| 6 | Move prize vault from *unclaimed* to *green* |
| 7 | **Announce winners once, on Friday**, on every server — the card names the server each winner came from |
| 8 | Compute the weekly pool and open **draft** payouts |
| 9 | **Announce pool standings once, on Saturday** |

**A duplicate award is structurally impossible**, not merely guarded: a trophy
exists only against money accounted for in the prize vault, and a redeem cannot
exist for a trophy the vault does not hold.
