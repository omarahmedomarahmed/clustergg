# Money

Every dollar that enters this platform is tracked from the moment a brand pays
to the moment a gamer is paid, through four ledgers and no stored balances.

**The rule underneath everything here: a balance is never a column.** Every
balance on every screen is `sum(ledger)` over rows that each name who moved the
money and why. A stored balance cannot be reconstructed once it goes wrong, and
eventually every one of them goes wrong.

---

## 1 · The vaults

```
                        ALL INCOME
            brands + server owners, every dollar
                            │
                    ┌───────┴───────┐
                    │  VAULT 1      │
                    │  income       │
                    └───────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
        50%               25%               25%
   ┌──────────┐     ┌──────────────┐    ┌──────────┐
   │ VAULT 2  │     │   VAULT 3    │    │ Cluster  │
   │  prize   │     │ server vault │    │          │
   └────┬─────┘     └──────┬───────┘    └──────────┘
        │                  │
   funds every        allocated BY HAND
   money-trophy       to each week's pool
        │                  │
        ▼                  ▼
   gamer redeems      owner withdraws
```

| Vault | Holds | Pays out as |
|---|---|---|
| 1 · Income | Every payment received | Split immediately on receipt |
| 2 · Prize | Money backing every money-trophy | Trophy redemptions |
| 3 · Server | Money owed to server owners collectively | Weekly pool → owner payouts |
| — · Cluster | Our margin | The business |

**Money reaches a vault when an invoice is marked paid** — never when it is
issued. Allocating on issue fills the vaults with money nobody has sent, and
every payout below then draws on a promise.

---

## 2 · The split

| Share | Goes to | On a $350 challenge |
|---|---|---|
| 50% | Prize | $175 |
| 25% | Server owners | $87.50 |
| 25% | Cluster | $87.50 |

The shares are an **operator setting**, not a constant hard-coded in the logic.
The prize half is fixed; the other half splits two ways.

---

## 3 · Vault 3 and the weekly pool — the half rule

Vault 3 accumulates 25% of everything sold. It does **not** flow automatically
into the weekly pool.

| # | Rule |
|---|---|
| 1 | Allocation is a deliberate admin action, every week |
| 2 | **`pool ≤ vault ÷ 2`, always.** The pool may never exceed half the vault |
| 3 | The held half funds refunds, disputes, and weeks when nothing sells |
| 4 | Nothing auto-allocates. A quiet week must still pay owners |
| 5 | The pool page names exactly which challenges fed this week's pool |

### Why the half rule matters

Money arrives for challenges that have not run yet. If a week's income were
allocated in full, one strong sales week would empty the vault into one pool and
the next quiet week would pay nobody — and there would be nothing left to claw
back a refund from.

**Worked over four weeks**

| Week | Sold | Into vault 3 | Vault before | Allocated (50%) | Vault after |
|---|---|---|---|---|---|
| 1 | $700 | $175.00 | $175.00 | **$87.50** | $87.50 |
| 2 | $350 | $87.50 | $175.00 | **$87.50** | $87.50 |
| 3 | $700 | $175.00 | $262.50 | **$131.25** | $131.25 |
| 4 | $350 | $87.50 | $218.75 | **$109.37** | $109.38 |
| | **$2,100** | **$525** | | **$415.62 paid** | **$109.38 held** |

Owners received $415.62 across the month and $109.38 remains available for a
quiet week or a refund. The pool never exceeded half the vault at any point.

**Week 4 is why the allocation floors rather than rounds.** Half of $218.75 is
$109.375, and there is no such coin. Rounding up would put the pool half a cent
*above* half the vault, which the rule forbids as an absolute and the guard
refuses outright — a guard cannot both refuse $109.375 and produce $109.38. So
it floors, and the spare cent stays held. Paid plus held still equals the
server share exactly; the cent moves between columns and nothing appears or
vanishes.

---

## 4 · How a weekly pool is divided

| Component | Share | Basis |
|---|---|---|
| **Flat participation** | 20% | Split **evenly** among every server that carried at least one entrant. Turning up is worth something |
| **By score** | 80% | The three KPIs below, percentile-ranked within a bracket |

### The three KPIs

| # | KPI | Measures | Weight |
|---|---|---|---|
| 1 | **Entrants** — ½ to the parent server, ½ to the join server. **Same server = 1.0** | Volume | 40 |
| 2 | **Conversion** — entrants **whose parent is this server** ÷ **linked members whose parent is this server**. Both sides parent-scoped, both whole gamers, denominator **live**. That is the only reading bounded at 1.0 | Efficiency | 30 |
| 3 | **Activation** — entrants who scored above zero ÷ entrants | Quality | 30 |

Attribution is defined in `docs/12-IDENTITY.md` §3. **Neither document is correct
without the other.**

| # | Rule |
|---|---|
| K1 | **No KPI may measure Discord activity.** Not bot commands, not card opens, not messages posted. Rewarding activity inside somebody else's product is a standing incentive to manufacture it, and it is the line we do not cross |
| K2 | All three measure outcomes on **our** platform |
| K3 | KPI 3 kills the fake-entrant attack: a member who joins and never plays *lowers* the server's score |
| K4 | All three are ratios or split volumes, so a large server cannot simply out-mass a small one |
| K5 | Shares can never sum past the true entrant count — at most two servers share one gamer, ½ each |
| K9 | **Conversion counts only entrants whose parent is this server.** Otherwise a server with 10 members converting 20 outsiders scores 2.0 — an unbounded ratio that rewards poaching over recruiting |
| K10 | **Eligibility is frozen at Monday's gun; all three KPIs are live.** The conversion denominator is live too — frozen at 10 while entrants grow would produce the same unbounded ratio |
| K11 | **The week's whole working is written down at the close** — every server's eligibility and why, both sides of every ratio, its rank, its shares, and which challenges it was credited on. `07-DATA-MODEL.md` `week_records` / `week_credits`. A closed week cannot be re-derived, because its inputs are live and have moved |
| K12 | **One function, two callers.** `/pool` reads it live for the open week; every historical surface reads the record. Never a second implementation of the same arithmetic |
| K13 | **The sentence explaining how a server is paid is generated from the attribution module**, not typed into a content default. It must name the parent, the join server, and the case where they are the same — because that third case is the one a retyped sentence always drops |
| K6 | **Winning a challenge earns a server nothing directly.** Entrants do |
| K7 | A server that never described itself is **dropped from the run**, not scored zero — otherwise it takes percentile positions from servers that did the work |
| K8 | Community challenges do not count toward any pool |

### Payouts open as drafts

The weekly close **computes**; a human **releases**. A job that moved money on
its own is one nobody could stop on a Sunday.

---

## 5 · The prize vault is a liability ledger

**This is the most important accounting rule on the platform, and the one most
likely to be built wrong.**

```
vault2.balance  ==  Σ(value of every unredeemed money-trophy
                      held by a live account)
```

Every trophy worth money is backed by real money sitting in vault 2. If every
holder redeemed in the same instant, we could pay all of them. That is the
promise, and the ledger is what keeps it.

### The five states

| State | Meaning | Alert |
|---|---|---|
| **Unallocated** | A bill was paid; no trophies assigned yet | ⚠️ amber — *"money in, not yet promised"* |
| **Unclaimed** | Trophies assigned to a challenge that has not ended | ⚠️ amber — *"promised, not yet delivered"* |
| **Green** | Every dollar sits on a gamer's profile | ✓ |
| **Over-allocated** | Trophies worth more than the vault holds | 🔴 **must be impossible** |
| **Orphaned** | The holder deleted their account. Real money, unclaimable | 🔴 admin sweeps, logged |

The vault cycles amber → amber → green with every challenge. That is normal and
the console should read as a rhythm, not an alarm.

### The rules

| # | Rule |
|---|---|
| V1 | **A redeem is impossible for a trophy the vault does not account for.** This is what makes duplicate awards and double payouts *structurally* impossible rather than merely guarded |
| V2 | A redeem **reduces the balance by exactly that trophy's value** and the holder count by one |
| V3 | **Over-allocation is guarded at assignment.** Trophy values must equal the challenge's prize pool — flag if over **and** if under |
| V4 | Admin can search the vault **by gamer name** and see every trophy they hold and whether a redeem is pending |
| V5 | A trophy's **value can never be edited**. A $100 trophy is a $100 trophy forever |
| V6 | Editable: **name, image, brand**. An edit propagates to every holder everywhere |
| V7 | Trophies **lock at `ended`** |
| V8 | Any trophy without a dollar value is a **collectable** and touches this vault not at all |

### Holding period — five years

| # | Rule |
|---|---|
| V9 | Trophies are held for **5 years** from award |
| V10 | Why: a 13-year-old who wins must still have it at 18, when they can redeem |
| V11 | After 5 years, sweep to Cluster — **logged with date, holder, value and reason** |
| V12 | A sweep is **reversible**. If the holder returns, admin reinstates and re-funds |
| V13 | The sweep log is the audit trail an unclaimed-property review would ask for. Confirm the treatment with the payments partner before the first sweep — there are five years to do it |

### Orphaned money

A gamer deletes their account while holding a $100 trophy. That $100 was paid by
a brand and can never be claimed.

| # | Rule |
|---|---|
| V14 | The money **stays in the vault**. It was real |
| V15 | The balance no longer equals live redeemable liability, so admin may **sweep it to Cluster**, logged |
| V16 | After the sweep the invariant holds again |
| V17 | Deletion is **refused outright** while a redemption is in flight — money already handed to a provider cannot be paid to a record that no longer exists |

---

## 6 · Community challenges

A server owner buys a competition for their own members.

| Tier | Prize pool | Winners | Cluster margin | Owner pays |
|---|---|---|---|---|
| 1 | $5 | 1 | **none** | $5.00 |
| 2 | $10 | 3 | 5% | $10.50 |

| # | Rule |
|---|---|
| C1 | Owner money pays into **vault 2 (prize)** and Cluster only |
| C2 | **It never touches vault 3.** Paying an owner from a pool their own money funded would pay them twice |
| C3 | A community challenge **does not count** toward any weekly pool |
| C4 | It is **public on the web** — that is the point |
| C5 | To enter you must join the server to get the key. The challenge *is* the server's advertising |
| C6 | **No rate limit and no fee.** Owners farming visibility is the growth engine, not abuse |
| C7 | They may run daily or weekly |
| C8 | Wording is always *"a community challenge run by this server"* |

---

## 7 · Refunds

| Situation | Rule |
|---|---|
| Provider outage kills a week | Push the challenge to the next week first. Same entrants, all scores reset, back to `announced`. Keep pushing if the outage persists |
| Brand wants out instead | Refund the prize share and the owner share |
| **The money is already in a paid pool** | **Claw back from the held half of vault 3.** This is exactly why the half rule exists |
| Nothing left to claw back | Cluster absorbs it. Never a gamer, never an owner already paid |
| Zero entrants by Monday | Not a refund. Remove from live, push to next week as `announced`, back into the queue with more time to gather entrants |

---

## 8 · Payment details

| # | Rule |
|---|---|
| P1 | **We never store a payment detail.** Not an IBAN, not a card, not a last four, not a routing number |
| P2 | What we store: a **preference word** (`bank`, `giftcard`, …) and an **opaque provider handle** |
| P3 | This is checked **structurally** — the schema is inspected for any column that could hold one, and the check fails if a new one appears |
| P4 | Country and currency are stored as short codes. Nothing account-shaped |

---

## 9 · A month, end to end, with real numbers

**Setup:** 10 servers · 2 brands · 100 linked gamers.

### Purchases

| Buyer | What | Price |
|---|---|---|
| Acme | League series, 4 consecutive weeks | $1,400 |
| Nova | Valorant, week 1 | $350 |
| Nova | Dota, week 3 | $350 |
| Nightfall (server) | Community challenge, tier 2, week 2 | $10.50 |
| | **Total received** | **$2,110.50** |

### Vault routing

| Source | → Prize | → Server | → Cluster |
|---|---|---|---|
| $2,100 brand income | $1,050.00 | $525.00 | $525.00 |
| $10.50 community | $10.00 | **$0.00** | $0.50 |
| **Totals** | **$1,060.00** | **$525.00** | **$525.50** |

### Week 1 in detail

| | |
|---|---|
| Challenges live | Acme League #1 ($175 prize) · Nova Valorant ($175 prize) |
| Trophies assigned | League: $100 / $50 / $25 + $0 participation · Valorant: $175 + $0 participation |
| **Prize-pool guard** | League $100+$50+$25 = **$175 ✓** · Valorant $175 = **$175 ✓** |
| Entrants | League 62 · Valorant 41 |
| Pool allocated | **$87.50** |
| Servers that carried an entrant | 8 of 10 |

**Pool division**

| Component | Amount | Result |
|---|---|---|
| Flat 20% | $17.50 | $2.19 to each of 8 servers |
| Scored 80% | $70.00 | Ranked on the three KPIs |
| Top server | | ≈ $21 |
| Smallest scoring server | | ≈ $3 |

### Month totals

| | |
|---|---|
| Challenges run | 7 — 6 sponsored, 1 community |
| Prize money committed | $1,060 |
| Owner payouts released | $415.62 |
| Held in vault 3 | $109.38 |
| Cluster gross | $525.50 |
| Trophies awarded | ≈ 350 — 8 podium, the rest $0 participation |
| Prize vault at month end | $1,060 minus whatever was redeemed |

**The check that must always pass:** at any instant, vault 2's balance equals
the sum of every unredeemed money-trophy held by a live account. If it does not,
something is wrong and the console says so before anybody has to ask.
