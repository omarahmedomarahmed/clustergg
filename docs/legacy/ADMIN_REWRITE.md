# The admin rewrite — what goes, what stays, what is new

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
> **The current truth, in this order:** the code, then `docs/PLAN.md`, then
> `docs/MODEL.md` and `docs/HANDOVER.md`. Where this file and the code
> disagree, the code is right and this file is history.

**Written before the conversion pass, because converting a page we are going to
delete is the most expensive kind of wasted work.**

---

## 1. What "the kit" is

`components/admin/kit.tsx`. Nine small components that every admin page draws
itself out of, instead of each page inventing its own markup.

| Component | What it is |
|---|---|
| `Page` | The title, the one-line "what this is for", and the buttons in the top right |
| `Section` | A panel with a heading and an optional note |
| `Stat` / `StatRow` | One number, with a label and a line saying what it counts |
| `Table` / `Tr` / `Td` | Rows, with a required sentence for when there are none |
| `Money` | A currency amount, always signed, negatives in red |
| `Note` | A blue/amber/red line explaining something before an operator acts |
| `Pill` | A status chip |
| `Danger` | A destructive control, with a required "here is what cannot be undone" |

**It is not a redesign.** The console looks the same. What changes is that
"a table of rows with a total" exists once instead of forty times, so it can be
fixed once. Four rules are now impossible to skip because the types demand them:

1. An empty table must say a **sentence**, not show a blank.
2. A number must carry **what it counts**.
3. Money is **never a bare number** (a payout screen where −50 renders as 50 is
   a screen that costs money).
4. A destructive button must state **what cannot be undone**.

---

## 2. What is NOT changing

Worth saying plainly, because "rewrite" sounds like everything moves.

| Staying exactly as it is | Why |
|---|---|
| Routing and URLs (except the merges below) | Staff bookmark admin pages |
| **Permissions** — one boundary, enforced once in `app/admin/layout.tsx` | This is good work. Systems → departments → pages, and the rail is built from the same predicate the guard uses, so it can never offer a door that 403s |
| Every server action | The wiring works; only the screens change |
| `lib/systems.ts` and the department model | The org model is right |

---

## 3. The finding that came out of writing this

**72 admin pages exist on disk. 57 are in the nav. Three are reachable by URL
only:**

| Orphan | Status |
|---|---|
| `/admin/ads` | Linked from one line of `brands/[id]` as "the master dashboard". Not in the nav, so nobody finds it. |
| `/admin/badges` | Linked from **nothing**. Its actions still exist and still revalidate it. |
| `/admin/dataroom/team` | Reachable — linked from `/admin/dataroom`. Fine; just not a nav item. |

Two more (`/admin/spaces`, `/admin/discord/messages`) are deliberate redirects
left behind after earlier merges. Those stay.

**All three orphans are closed.** `/admin/ads` was deleted, `/admin/badges` is
registered under Competition, and `/admin/dataroom/team` is fine as it was.

### The bug the redirects were hiding

Writing the merges surfaced something the two *earlier* merges already had, and
nobody had hit: **a redirect stub is a page like any other, and an unregistered
page is admin-only.** So `pathAllowedFor` denied `/admin/spaces` outright — a
staff member clicking an old bookmark got a 404 from the layout guard before the
redirect ever ran. A 404 on a page that still exists under a different name is
the worst answer available: it says "gone" when the truth is "moved".

Fixed with one map, `MOVED_ROUTES` in `lib/admin-nav.ts`. The guard resolves a
moved path to its destination and applies the destination's rule; every stub
reads its target from the same map, so the redirect and the guard cannot
disagree. Checked after `ADMIN_ONLY`, so a redirect can never become a way
around it — and `tests/db/taxonomy.mts` asserts both halves: that the old
bookmark opens for the desk that owns the new page, and that it does not open
for a desk that never owned the old one.

---

## 4. Page by page

### DELETE (2 — was 3, see the correction)

| Page | Why |
|---|---|
| `/admin/ads` | A second ad dashboard. Everything on it is on `/admin/ads/schedule` and `/admin/ads/analytics`, and it is not in the nav — the one link to it calls it "the master dashboard", which is exactly the confusion two dashboards create. |
| ~~`/admin/badges`~~ | **CORRECTED — kept and registered instead.** I wrote it up as "hand-grants around the rules". It is not: it is the badge CATALOGUE editor (`saveBadge` / `deleteBadge` define badges, and `lib/badges.ts` grants them by rule). Deleting it would have removed the only way to manage badge definitions. Orphaned from the nav was the real bug; the fix is a nav entry. |
| `/admin/creative-studio` | 70 lines wrapping an image tool that duplicates `/admin/shots` and `/admin/brand-kit`. Three places to put an image is three places to look for one. |

### MERGE (14 pages → 4) ✅ done

Nothing is lost. Every merge target keeps the same controls, as tabs, and every
old URL redirects to the tab that replaced it.

| These | Became | Why |
|---|---|---|
| `content`, `chrome`, `mobile`, `partners` | **`/admin/content`** — tabs: Copy · Nav & footer · Mobile · Partners | All four are "edit some site text/links". Three of them are under 60 lines. |
| `backgrounds`, `cards`, `cards/guide` | **`/admin/art`** — tabs: Page backgrounds · Card backgrounds · Card layouts | All three are "pick the art for a surface". `cards` and `backgrounds` are 26 lines each, and the card guide already opened with a hand-written back-link to `cards` — a tab bar somebody had built by accident. |
| `language`, `translations` | **`/admin/language`** — tabs: Interface · Marketing copy · Content · Countries & flags | Four tabs rather than the two planned: the old language page stacked three large editors down one column, and splitting them costs nothing once the shell exists. |
| `brand-enquiries`, `brands/testimonials` | **`/admin/brands`** — tabs: Brands · Enquiries · Testimonials | Three views of the same relationship. An enquiry becomes a brand becomes a testimonial. |

The tab lives in the URL (`?tab=`), not in React state, and that is load-bearing
three ways: a tab is bookmarkable, `revalidatePath` puts an operator back where
they were, and **the panels stay server components** — only the active tab's
queries run. A merge that fetched all four panels would have made one page
slower to open than the four it replaced. The card studio is the proof: it loads
every layout, the brand art, the asset library, the button copy and several real
samples per card kind, and none of that is paid for by somebody opening "page
backgrounds".

That is **13 → 5** in "Design & content", which is the group you were right to
call badly organised.

### NEW (2 already shipped, 2 proposed)

| Page | State |
|---|---|
| `/admin/vaults` | ✅ Shipped. Four vault balances, the split, transfers, breakage, CP runway. |
| `/admin/week` | ✅ Shipped. The Monday close, the score, eight weeks of payouts. |
| `/admin/delivery` | ✅ Shipped. What every brand's creatives actually delivered — the staff-side view of B82. |
| `/admin/cp` | ✅ Shipped. The CP dial: set the daily ceiling, see the vault's runway, apply the plan. |

**Both existed as a library with no caller**, which is the worst state for
anything that touches money: written, reviewed, tested, and unreachable.

`/admin/cp` is the one that mattered. `lib/cp-dial.ts` shipped with C1 and
nothing called it, so the ceiling on what the gamer economy costs was only
movable by editing a settings row by hand — with no view of what it does to a
mission, and none of what it does to the vault's runway. The page is those two
questions beside the control, and `app/actions/cp-dial.ts` is the only thing
that can move it. It writes the ceiling AND rescales the mission weights in one
call, because doing either alone is what breaks the model: raise the ceiling
and a mission is still worth what it was worth; rescale the weights and the
ceiling is a bound nobody is near, or one everybody hits by lunchtime.

The plan is recomputed on the server from the weights the QUESTS are running,
never from the catalogue defaults and never from anything the form posted. The
dial's preview is a lookup into server-computed plans rather than a second
implementation — a client-side copy of that arithmetic that drifts is a screen
that lies about what a button will do.

`/admin/delivery` answers "is this campaign delivering?" without opening a
customer's own page and reading it as though we were the customer. It puts the
brands delivering NOTHING at the top, because a brand with zero views does not
log in to look at a zero — an active brand with creatives loaded and nothing
delivered this month is always an operational failure, and it was invisible
from every other screen. Same `deliveryFor`, so the same three bounds hold and
none of them is relaxed for staff: aggregate only, no identity in any row, and
no composition under 25 viewers. A staff screen reporting a breakdown the
brand's own screen suppresses is still a re-identification.

### KEEP AND CONVERT (the rest)

Ordered by whether being wrong costs money.

| Priority | Pages |
|---|---|
| **Money** (done) | `vaults`, `week`, `billing`, `payouts`, `redeems`, command centre |
| **Money** (next) | `payments`, `offers`, `stuck`, `growth-review` |
| **Brands & ads** | `brands`, `creatives`, `placements`, `ads/schedule`, `ads/analytics` |
| **Discord** | `discord`, `discord/[guildId]`, `discord/requests`, `discord/broadcast`, `discord/analytics`, `discord/hq` |
| **Competition** | `challenges`, `quests`, `trophies`, `leaderboards`, `profile-week`, `marketplace`, `cp-calculator` |
| **Gamers** | `users`, `linked-accounts` |
| **Platform** | `systems`, `departments`, `roles`, `settings`, `storage`, `audit-log`, `analytics`, `email`, `dataroom`, `shots`, `brand-kit`, `games`, `game-worlds`, `connect`, `spaces/requests` |

---

## 5. The regrouping ✅ done

Groups were by **thing**. They are now by **job** — which desk you sit at.

| Was | Is | Change |
|---|---|---|
| Overview (6) | **Overview** (5) | Analytics moved to Platform |
| Ads & revenue (13) | **Money** (9) + **Brands & ads** (5) | One group was doing two unrelated jobs: closing the books, and running campaigns |
| Design & content (13) | **Content** (5) | The merges above; `email` moved to Platform |
| Competition (11) | **Competition** (12) | `redeems`, `stuck` and `growth-review` moved to Money — they are payouts — and Games & planets folded in |
| Games & planets (4) | folded into **Competition** | Four pages is not a section |
| Community (4) | **Gamers** (2) + Platform (2) | `roles` and `departments` are staff administration, not community |
| Discord (5) | **Discord** (5) | unchanged |
| Platform (2) | **Platform** (6) | Everything that is "run the company" rather than "run the product" |

Money is second, ahead of everything except the front door, and it is the only
group whose blurb says what being wrong costs.

**No permission changed.** The group-level `area` gate only ever applied on the
`navFor` path, and both callers take that path solely for super admins — staff
go through `navForSystems`, which reads the per-page `system` field. Moving a
page between groups moves where it is listed and nothing else.

---

## 6. Order of work

1. ~~The kit, `/admin/vaults`, `/admin/week`~~ ✅
2. ~~Money pages: billing, payouts, redeems, command centre~~ ✅
3. ~~**Deletes and merges**~~ ✅ — 2 deleted, 14 → 4 merged, every old URL kept
   as a redirect.
4. ~~Regroup the nav~~ ✅ — eight groups, by job.
5. Convert the rest, money-first order above.
6. `/admin/delivery` and `/admin/cp`.

### What shipping 3 and 4 actually cost

Deleting a page is not deleting its references, and the ones left behind were
the whole job:

- `requireSystemFor("/admin/ads")` in two offer actions. `pathAllowedFor` denies
  any path no desk claims, so deleting the page would have made both actions
  fail for every staff member — silently, at the moment somebody pressed the
  button. Repointed to `/admin/offers`.
- Ten `revalidatePath` calls across five action files pointing at routes that no
  longer exist.
- `/admin/brands/testimonials` needed a redirect **stub**, not just a nav
  removal: without a static file at that path Next falls through to
  `/admin/brands/[id]` and renders a brand detail page for a brand whose id is
  the word "testimonials". A 200 that looks like a broken brand.

And the sweep needed extending. It discovers routes from the nav, and a merged
page only registers its default tab — so without the tab pass, three of
`/admin/content`'s four panels would have been exactly as unreachable-by-test as
the orphans this document was written to find.

**Every step keeps the sweep green.** `tests/ui/admin-sweep.mjs` opens every
route in the nav and fails on a 500 *or* an error boundary — the boundary being
the one that hides, because it returns 200 and looks like an empty state.

---

## 7. What this does not touch

The **gamer-facing and brand-facing pages**. They are not legacy: they were
rebuilt as the model changed, and rewriting working surfaces would re-open bugs
five review passes just closed. The one exception is `/pricing`, which still has
three-tier scaffolding around a one-package model — that is a B78 follow-up, not
part of this.
