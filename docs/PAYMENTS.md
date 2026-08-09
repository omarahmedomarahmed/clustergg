# Payments

How money moves through Cluster, who moves it, and how to switch it on. No
terminal commands anywhere in this document — everything here is done in a
browser.

---

## The one rule

**Cluster never holds a payment detail.** Not a card number, not an IBAN, not a
routing number, not a wallet address. What is stored is a *preference* — the
word "bank", the word "PayPal" — and an opaque handle from a provider that
means "the details you already hold for this person".

This isn't caution for its own sake. A gaming platform holding the bank details
of a few thousand teenagers is a breach waiting to be somebody's worst year, and
the only version of this feature worth shipping is the one where there is
nothing to steal.

If you ever find yourself adding a column called `account_number`, the design
has failed and the answer is a different provider, not a new column.

> **What was deleted.** Trophy redemption used to ask gamers for a routing
> number, an account number and a mobile wallet number, and store all three.
> The migration in `lib/db/index.ts` erases every one of those values on the
> next boot and nothing writes them again. This is permanent and intended.

---

## Three flows, three different problems

| | Who | What it looks like | What actually matters |
|---|---|---|---|
| **Collect** | Brands pay us | A handful of B2B invoices a month, roughly one to ten thousand dollars, from companies anywhere | A finance department can pay it by card or transfer **without an account**, and the receipt is a real invoice |
| **Payout** | We pay server owners | Recurring, named counterparties, real amounts, tax-reportable | Their bank details are entered **on the provider's page**, and their tax form is the provider's problem |
| **Rewards** | Gamers cash out trophies | High volume, small amounts, often teenagers, often unbanked, anywhere on earth | We **never ask** where the money should go — they choose for themselves |

Treating these as one problem is how platforms end up building payment
infrastructure by accident. They are separate in the code (`lib/payments/`),
separate in the admin console (`/admin/payments`), and can each run on a
different vendor.

---

## What we chose, and why

### Collect → **Payoneer**, moving to Stripe when there's an entity for it

Brands are *invoiced*, not checked out. Payoneer's "Request a Payment" issues a
branded invoice that a client pays by card, ACH or local bank transfer, from 190+
countries in 70+ currencies — and, the part that decides it, **it onboards
companies that Stripe will not**. For a business operating out of Egypt or most
of MENA that is the difference between billing being possible and not.

Payoneer has no usable API for issuing payment requests on a standard account,
so it runs on the **manual** adapter: staff raise the request in Payoneer's
dashboard and paste the link onto the invoice. The brand's experience is
identical, and the invoice, the terms, the reminders and the ledger all live
here.

Switch to **Stripe Invoicing** the day there is an entity Stripe supports — the
adapter is already written and the invoice pages don't change.

Considered and rejected: **Paddle** (merchant of record, would remove global
sales tax entirely and accepts sellers with no company — but its acceptable-use
policy is built around software and is restrictive about *services*, and
advertising/media buying is exactly what Cluster sells; check this before
building on it, not after). **Wise Business** (unbeatable FX, but a brand
transfers, they don't click Pay).

### Payout → **Trolley**

210 countries. The owner's bank details are entered inside Trolley's own iframe
widget, embedded in our portal — what they type is posted to Trolley and never
touches our servers. It collects and e-files tax forms (W-9/W-8BEN), which is a
real problem for anyone paying owners across thirty countries and one we should
never build.

Trade-off: business verification up front, so it is not the vendor you start
with on day one. Until it's connected, payouts run manually — same queue, same
lines, staff transfer and record the reference.

### Rewards → **Tremendous**

The hardest payment in the product — small, global, often to somebody with no
bank account — and Tremendous solves it by **not asking**. We send an amount and
a name; it returns a link; the gamer opens it and chooses for themselves between
a bank transfer, PayPal, a prepaid Visa or a gift card in their own currency,
from 200 countries and 2,000+ options.

It is **free** (no API, setup or subscription fee — you pay the face value of
what you send; cash-style options carry 4–6% and every send must include at
least one no-fee option), and **the sandbox needs no approval**, so this is the
one you can finish today.

Full notes on every vendor, including the reasons *not* to use each, are in
`lib/payments/vendors.ts` and rendered at **`/admin/payments`**.

---

## Nothing is blocked on any of this

With **zero** providers connected, the whole cycle works:

- Invoices are created, itemised, edited, discounted, sent, paid and voided.
- Staff paste a payment link from whatever provider raised it.
- Payouts are opened from the earnings ledger, reviewed line by line, approved
  and marked paid with a reference.
- Trophy redemptions are requested, approved, released and recorded.

The `manual` adapter is not a stub. Connecting a provider changes which adapter
runs — it does not change a single page or table, and no invoice or payout is
orphaned by the switch.

---

## Setting up Tremendous (10 minutes, no terminal)

The one to do first: it's free, needs no company documents, and it's what pays
your gamers.

1. **Sign up** at <https://www.tremendous.com> → *Get started*. A business email
   is enough.
2. **Open the sandbox.** Top-right environment switcher → **Sandbox**. Nothing
   here spends real money.
3. **Team Settings → Developers → Add API key.** Copy it — it's shown once.
4. **Campaigns → New campaign** (optional). A campaign decides which redemption
   options a gamer is offered and puts your logo on the page. Copy its ID if you
   make one. Include at least one no-fee option — Tremendous requires it, and
   it's what lets a gamer take the full amount.
5. **Funding.** In sandbox there's a test balance already. For production,
   *Settings → Funding* and add a source; Tremendous is prepaid, so money sits
   in a balance before rewards clear.
6. **Add the variables** in your hosting dashboard (Vercel → your project →
   *Settings → Environment Variables*), for **Production and Preview**:

   | Name | Value |
   |---|---|
   | `TREMENDOUS_API_KEY` | the key from step 3 |
   | `TREMENDOUS_ENV` | `sandbox` while testing, `production` when live |
   | `TREMENDOUS_CAMPAIGN_ID` | from step 4, if you made one |
   | `TREMENDOUS_FUNDING_SOURCE_ID` | from step 5; leave unset to use the balance |

7. **Redeploy.** Environment changes don't apply to an already-built deployment —
   in Vercel, *Deployments → ⋯ → Redeploy*.
8. **Point the flow at it.** Open `/admin/payments`, set **Gamers cash out
   trophies** to Tremendous, Save. The page will show a ✓ once the key is live,
   and a `sandbox` / `production` badge so nobody ever wonders which one is
   running.
9. **Test it end to end.** Have a demo gamer request a redeem, approve it at
   `/admin/redeems`, press **Release**, then open the collection link. In sandbox
   you'll see the real redemption page with test rewards.

**When you go live:** switch `TREMENDOUS_ENV` to `production`, paste the
production API key, redeploy. Everything else stays as it is.

---

## Setting up Payoneer for brand invoices (no terminal, no code)

Payoneer runs on the manual adapter — there's nothing to configure in the app.

1. **Sign up** at <https://www.payoneer.com> and complete verification. You'll
   need business and identity documents; this is the step that takes days, not
   minutes, so start it early.
2. **Payoneer dashboard → Get Paid → Request a Payment.** Enter the brand's
   details and the amount from the Cluster invoice.
3. **Copy the payment link** Payoneer gives you.
4. **In Cluster:** `/admin/billing` → click the invoice → paste the link into
   **Payment link**, type `payoneer` as the provider, **Attach** → **Send to
   brand**.
5. The brand sees it on their portal's **Billing** tab and can forward
   `/pay/<token>` to their finance department — that page opens the invoice and
   the payment button with no portal key.
6. When it lands in your Payoneer balance, **Mark paid** with the reference.

---

## Setting up Trolley for server-owner payouts

1. **Apply** at <https://trolley.com>. Business verification required.
2. **Settings → API keys** → create a key pair. Copy both.
3. Add `TROLLEY_ACCESS_KEY` and `TROLLEY_SECRET_KEY` in your hosting dashboard,
   then redeploy.
4. `/admin/payments` → set **We pay server owners** to Trolley → Save.
5. Owners then see *Enter your details with Trolley* on their portal's
   **Earnings** tab; the widget opens inside the page and everything they type
   goes to Trolley.

> **One thing to check with real keys in hand:** the widget URL signature format
> (`lib/payments/trolley.ts`). Trolley has revised the query-parameter set
> before, and it's the one piece of that adapter that can't be verified without
> credentials. The REST calls follow their documented v1 API.

---

## Setting up Stripe Invoicing (once there is a supported entity)

1. <https://dashboard.stripe.com> → complete business onboarding.
2. **Developers → API keys** → copy the **secret** key.
3. Add `STRIPE_SECRET_KEY` in your hosting dashboard, redeploy.
4. `/admin/payments` → **Brands pay us** → Stripe → Save.
5. On any invoice, **Or ask the provider to mint one** creates a real hosted
   Stripe invoice with a number, a PDF and a Pay button, with our line items as
   its line items.

Stripe does not accept sellers in Egypt or most of MENA. The adapter is finished
and correct; it simply cannot be used until incorporation says otherwise.

---

## The brand billing cycle

An invoice is **derived**, not typed. `lib/invoices.ts` builds it from the same
`quote()` the public pricing page runs, so a bill can never quote a price the
website doesn't.

**Do not reproduce the numbers here.** They live in `lib/pricing.ts`
(`PRICING_DEFAULTS`, overridable per-install from the CMS) and this document has
already been wrong once by copying them: it described a **$600 placements base**,
a **$100 tier discount** and a **$250** challenge under a heading claiming the
bill is derived. All three were retired by **C11** — `reachBase`, `challengeBase`
and `ultimateBase` are now **0** and there is one package, priced per challenge —
and the price had moved besides. A page that quotes a rate is a rate we are held
to by whoever read it.

The shape, which is what this document is for:

```
Sponsor a game's challenges   games × challengesPerGame × challengePrice
                              ( → lib/pricing.ts: perGame() )
Optional add-ons              streamAddon, when taken
Yearly                        12 months less yearlyDiscountPct
```

Half of the challenge price is the prize pool and never ours — that split is
`DEFAULT_SPLIT` in `lib/vaults.ts` and is described in `docs/MODEL.md`.

**Then every line is editable** — label, quantity, amount — and a discount is a
line with a negative amount. Sales negotiates; a billing system that refuses to
print a negotiated number is one people work around in a spreadsheet, and then
the invoice the brand received is a document this platform has never seen.

Terms run **30 days from issue**, not "the 1st of the month": a brand that signs
on the 20th and gets a bill due on the 1st has been given eleven days' terms and
will say so.

**Lifecycle:** `draft` → `sent` → `paid` (or `void`). A draft is invisible to the
brand. Sending requires a payment link — an invoice with nowhere to pay just
ages. A sent invoice can be voided but never deleted, because somebody else has
a copy of it.

Totals are **never stored**. An invoice's total is the sum of its lines,
recomputed on read, so a header can't disagree with its own body.

**Pages:** `/admin/billing` (staff) · brand portal **Billing** tab ·
`/pay/<token>` (public, unguessable, rotatable).

---

## Server-owner payouts

Two earning types on the owner's **Earnings** tab, shown separately and **never
added together**:

- **Sponsored challenge share** — their cut of what a brand paid, scaled by how
  many of their members are linked (5% at 500, 10% at 1,000, 25% at 5,000) and
  apportioned by how many of a challenge's entrants came from their server.
  **This is theirs**, and it's what a payout draws on.
- **Their members' winnings** — prize money won by people in their server. **Not
  theirs, never paid to them.** It's on the page because it's the clearest proof
  hosting the bot did something for their community, and because an owner who
  believes the prize pool is their revenue will find out at the worst possible
  moment.

**Only staff can move money.** An owner sees what they're owed and can ask about
it; the release is always ours, always attributed to a named person in the audit
log, and always against lines they can check challenge by challenge.

**Lifecycle:** `requested` (opened by an admin from the ledger, amount computed
not typed, already-paid amounts netted off as a visible line) → `approved` /
`processing` (released to the provider) → `paid`. A failed release is written
down as `failed` with the reason — a payout that quietly didn't send is worse
than one that visibly failed, because nobody chases it.

Open and release are **two separate clicks** on purpose. Collapsing them makes
the review step optional, and the review step is the only reason a human is in
this loop.

**Pages:** `/admin/payouts` (staff) · server portal **Earnings** tab.

---

## Trophy redemption

`pending` → `approved` (staff) → `sent` (provider issues a collection link) →
`paid` (the gamer collected it, or staff recorded a manual transfer).

The gamer's trophies are locked as `pending` when they request, returned to
`held` if it's cancelled or rejected, and become `redeemed` when paid.

The gamer's word closes it. The money has already left, the provider has its own
record, and making somebody chase staff to confirm receipt of their own payout
is a support queue built out of nothing. Staff can still mark it paid, and the
provider's dashboard is the authority if the two disagree.

**Pages:** `/admin/redeems` (staff) · the gamer's trophy case on their profile
and feed.

---

## Where the secrets live

Environment variables, set in your hosting dashboard, and **only** there.

`/admin/payments` stores a *choice* — the word `tremendous` — in the CMS, and
nothing else. It cannot read or write a key. The green ticks on that page mean
"the variable exists"; there is no path by which it could show you a value.

| Variable | For |
|---|---|
| `TREMENDOUS_API_KEY` · `TREMENDOUS_ENV` · `TREMENDOUS_CAMPAIGN_ID` · `TREMENDOUS_FUNDING_SOURCE_ID` | gamer rewards |
| `TROLLEY_ACCESS_KEY` · `TROLLEY_SECRET_KEY` | server-owner payouts |
| `STRIPE_SECRET_KEY` | brand invoicing |

Missing keys are not an error state. The flow falls back to `manual` and the
console says so in a sentence — a payouts page that refuses to load because
somebody selected Trolley last week and never pasted the secret has turned a
configuration mistake into an outage.

---

## Files

| Path | What it is |
|---|---|
| `lib/payments/vendors.ts` | The research, as data. Rendered at `/admin/payments`. |
| `lib/payments/types.ts` | The interfaces every adapter satisfies. Read the header. |
| `lib/payments/index.ts` | Which adapter runs for which flow, and why. |
| `lib/payments/manual.ts` | The adapter that always works. |
| `lib/payments/tremendous.ts` · `trolley.ts` · `stripe.ts` | The wired vendors. |
| `lib/invoices.ts` | The brand billing model. |
| `lib/payouts.ts` | Server payouts and the preference-only account. |
| `app/actions/billing.ts` · `payouts.ts` · `payments.ts` · `trophies.ts` | Everything staff and owners can do. |
