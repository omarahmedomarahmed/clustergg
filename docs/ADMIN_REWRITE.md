# The admin rewrite — what goes, what stays, what is new

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

---

## 4. Page by page

### DELETE (2 — was 3, see the correction)

| Page | Why |
|---|---|
| `/admin/ads` | A second ad dashboard. Everything on it is on `/admin/ads/schedule` and `/admin/ads/analytics`, and it is not in the nav — the one link to it calls it "the master dashboard", which is exactly the confusion two dashboards create. |
| ~~`/admin/badges`~~ | **CORRECTED — kept and registered instead.** I wrote it up as "hand-grants around the rules". It is not: it is the badge CATALOGUE editor (`saveBadge` / `deleteBadge` define badges, and `lib/badges.ts` grants them by rule). Deleting it would have removed the only way to manage badge definitions. Orphaned from the nav was the real bug; the fix is a nav entry. |
| `/admin/creative-studio` | 70 lines wrapping an image tool that duplicates `/admin/shots` and `/admin/brand-kit`. Three places to put an image is three places to look for one. |

### MERGE (14 pages → 4)

Nothing is lost. Every merge target keeps the same controls, as tabs.

| These | Become | Why |
|---|---|---|
| `content`, `chrome`, `mobile`, `partners` | **`/admin/content`** — tabs: Copy · Nav & footer · Mobile · Partners | All four are "edit some site text/links". Three of them are under 60 lines. |
| `backgrounds`, `cards`, `cards/guide` | **`/admin/art`** — tabs: Page backgrounds · Card backgrounds · Card layouts | All three are "pick the art for a surface". `cards` and `backgrounds` are 26 lines each. |
| `language`, `translations` | **`/admin/language`** — tabs: Locales · Translations | One is the switch, the other is the strings. Nobody uses one without the other. |
| `brand-enquiries`, `brands/testimonials` | **`/admin/brands`** — tabs: Brands · Enquiries · Testimonials | Three views of the same relationship. An enquiry becomes a brand becomes a testimonial. |

That is **13 → 4** in "Design & content", which is the group you were right to
call badly organised.

### NEW (2 already shipped, 2 proposed)

| Page | State |
|---|---|
| `/admin/vaults` | ✅ Shipped. Four vault balances, the split, transfers, breakage, CP runway. |
| `/admin/week` | ✅ Shipped. The Monday close, the score, eight weeks of payouts. |
| `/admin/delivery` | **Proposed.** What every brand's creatives actually delivered — the staff-side view of B82. Today the numbers exist only inside a brand's own portal. |
| `/admin/cp` | **Proposed.** The CP dial: set the daily ceiling, see the vault's runway, apply the plan. `lib/cp-dial.ts` is built and nothing calls it. |

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

## 5. The regrouping

Current groups are by **thing**. The proposal groups by **job** — which desk
you sit at.

| Now | Proposed | Change |
|---|---|---|
| Overview (6) | **Overview** (5) | Analytics moves to Platform |
| Ads & revenue (13) | **Money** (8) + **Brands & ads** (5) | One group was doing two unrelated jobs: closing the books, and running campaigns |
| Design & content (13) | **Content** (5) | The merges above |
| Competition (10) | **Competition** (7) | `redeems` and `stuck` move to Money — they are payouts |
| Games & planets (4) | folded into **Competition** | Four pages is not a section |
| Community (4) | **Gamers** (2) + Platform (2) | `roles` and `departments` are staff administration, not community |
| Discord (5) | **Discord** (6) | unchanged, plus `discord/hq` |
| Platform (2) | **Platform** (~12) | Everything that is "run the company" rather than "run the product" |

---

## 6. Order of work

1. ~~The kit, `/admin/vaults`, `/admin/week`~~ ✅
2. ~~Money pages: billing, payouts, redeems, command centre~~ ✅
3. **Deletes and merges** — before any more conversion, so no deleted page is
   ever converted.
4. Regroup the nav.
5. Convert the rest, money-first order above.
6. `/admin/delivery` and `/admin/cp`.

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
