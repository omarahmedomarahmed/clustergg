# The model

What Cluster sells, what it costs, and where every dollar goes. Current as of
the B92 sprint. Supersedes `docs/legacy/COMMERCIAL_MODEL.md` and
`docs/legacy/COMMERCIAL_MODEL_V2.md`, both of which are kept because the
reasoning that got us here is still worth reading.

---

## 1. What we sell

**A weekly challenge on one game, inside the Discord servers that play it.**

A brand's name is on the competition, their trophy is on the winner's profile
permanently, and the reach they are billed against is counted from a delivery
ledger rather than estimated. They buy 1 to 4 consecutive weeks; four is a
month, and a month is how a media buy is planned.

Anything longer, mixed across more games, or priced outside the rate card is a
**custom deal**: an operator builds it, a campaign is created from what they
typed, and the brand confirms it in their own portal. There is no upper limit on
weeks in a custom deal, and no way for a brand to self-serve past four.

**We do not sell display inventory inside Discord.** Brand imagery lives on our
own domain and the bot links to it. That was a legal read (`docs/B73_RESEARCH.md`)
and it turned out to be the better product anyway.

---

## 2. The split

Every dollar that arrives divides four ways, and the shares are a setting an
operator can change (`/admin/vaults`), not a constant in the code:

| Vault | Default | Whose it is |
|---|---|---|
| **Prize** | 50% | The gamers', as trophies. A **liability**, not income |
| **Server pool** | 15% | Divided weekly between the servers that carried a public challenge |
| **CP vault** | 15% | Funds every point a gamer earns from ordinary play |
| **Cluster** | 20% | Ours |

**No vault has a balance column.** Each is `sum(amount)` over a ledger where
every row names who moved it and why. A stored balance cannot be reconstructed
after it goes wrong, and every one of them eventually goes wrong.

**Money reaches a vault when an invoice is marked paid**, never when it is
issued. Allocating on issue fills the vaults with money nobody has sent and
every payout below draws on a promise.

---

## 3. What a server owner earns

Not a percentage of a challenge. C3 deleted that rate, because running it
alongside the pool would pay an owner twice out of one line.

**The weekly close** runs on Monday (`lib/week-close.ts`):

1. An operator **releases** an amount of the server vault for the week. What is
   not released is the **reserve** — that is what pays owners through a week
   when nothing sells.
2. Servers that carried a **public** challenge are scored on three terms:
   exclusive-weighted entrants (40), newly qualified members (30), and entrant
   conversion (30). Every term is percentile-ranked **within a bracket**.
3. **20% of the pool is split flat** between everybody who took part, placed or
   not. Turning up is worth something.
4. The rest is shared in proportion to score, inside the bracket. **60 / 25 / 15**
   across small, mid and large. A bracket decides who you compete against and
   nothing else, so four large servers can never take the small share.
5. A **draft payout** is opened for each. Money moves when a human releases it.

**What does not count:** a private challenge the owner bought themselves. That
money came from brands buying public inventory, and paying an owner out of it
for their own event pays them twice. **What does count:** every member who links
an account, whatever prompted it. *A private challenge grows you, it does not
pay you twice.*

---

### The pool is public

`/pool` shows this week's released pool, every server competing for it, what
each has done and what each would be paid if the week ended now — computed by
the same function that writes Monday's cheques, not by a second implementation
that could drift from it. The reserve is shown too: it is what pays owners
through a week when nothing sold.

---

## 4. The owner's wallet

`earned − paid − requested − spent = available`, every term a sum over rows.

- **Withdraw** it, minimum $20. Below that a transfer spends most of itself in
  fees, so it keeps sitting there. Requesting a withdrawal makes the money
  unspendable immediately, so it can never go out twice.
- **Spend** it on a private challenge for their own members: the prize pool plus
  **5%**.

That 5% is not a hidden charge. It is what makes a private challenge a **product
we sell** rather than us moving an owner's money to their members — which would
be money transmission. The owner buys a competition; we then owe the prize as
our own obligation.

---

## 5. What a gamer gets

- **Points (CP)** for playing, under a **daily ceiling** derived from what the
  operator released from the CP vault that week, divided by the eligible gamers,
  divided by the days left. The ceiling is not a limit we impose for its own
  sake — it is the reason the points are still worth something in six months.
- **Trophies** for winning, kept permanently on their profile. A challenge pays
  **1 to 10 places**; whoever bought it decides how deep.
- **Cash**, by redeeming a trophy, from 18. Where they live decides whether that
  is possible at all, which is why country is asked before anybody earns rather
  than at the moment they try to collect.

### None of it starts until the account is real

Three steps, one page, about a minute: **link a game account**, **confirm an
email** (a six-digit code, sent automatically at signup), and **answer three
questions** — age band, country, and the colours their card wears.

Until all three are done, **nothing accrues.** No points, no trophies, no
challenge entry. We used to let a balance build to a cap, on the argument that a
number somebody can watch climb is a better reason to finish than an empty
screen. It is a good argument and it lost to a better one: a balance is a
promise, and a promise made to an account whose age, country and inbox we do not
know is one we may not be able to keep.

Two age bands are selectable — **13 to 17** and **18 or over**. Under-13 is not
one of them; it is a link that explains why, asks for a typed confirmation, and
deletes the account. A salted hash of the email and the Discord ID is kept
afterwards, and nothing else, so the same person cannot sign up again a minute
later with a different answer.

A confirmed account carries a **check mark** — gold at 18+, blue below it, and
the hover text says "Confirmed account" and never an age. It can be switched off
in one place, and switching it off changes nothing about what they may do.

---

## 6. The lifecycle every challenge follows

```
draft → queued → announced → live → ended
```

**Two gates, deliberately separate.** *Announced* makes it visible and joinable,
days before it starts. *Live* is when scoring begins, for everybody at once.
Publishing early is how a competition gets a field; scoring early would hand an
early entrant a head start nobody could match.

**Nothing is announced before its bill is paid.** That check is the only thing
standing between a handshake and a promise to every server on the network.

---

## 7. What we will not do

| Not doing | Why |
|---|---|
| Show a brand another brand's numbers | Which is exactly why they never see yours. Platform benchmarks with nobody named instead |
| Describe any audience group under 25 people | A count of three is three people somebody can name |
| Slice an audience by age band | It is a compliance field. Slicing by it is the under-18 profiling nine jurisdictions bar |
| Promise a per-challenge rate to an owner | A rate quoted is a rate we are held to, and the pool is not a rate |
| Store a payment detail | Not an IBAN, not a card, not a last-four. See `docs/PAYMENTS.md` |
