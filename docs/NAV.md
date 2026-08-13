# The nav — what it is, and what a rewrite may not lose

The top bar, the Profile-of-the-Week band and the mission band were ten files
and 2,417 lines that only ever appeared together, on every page, inside one
`<header>`. They shared a background image, a height variable, a sticky
context and a set of admin switches, and none of that was written down
anywhere — it was distributed across the files by convention.

This document is the contract. It exists because the rebuild deletes all ten
and a rebuild that silently drops an admin switch is worse than the mess it
replaced: nobody notices until an operator turns something off and it stays on.

## The files this replaces

| File | Lines | Fate |
| --- | --- | --- |
| `components/Nav.tsx` | 393 | rewritten — the one server entry point |
| `components/WeekBand.tsx` | 1017 | folded in |
| `components/MissionBand.tsx` | 196 | folded in |
| `components/NavMenus.tsx` | 151 | folded in |
| `components/NavQuestCard.tsx` | 120 | folded in |
| `components/nav/NavMenuBar.tsx` | 184 | folded in |
| `components/UserMenu.tsx` | — | folded in |
| `components/MobileMenu.tsx` | — | folded in |
| `components/MobileHud.tsx` | — | folded in |
| `components/UnlockChecklist.tsx` | — | folded in |

`AddBotButton` and `BrandHeader` stay where they are: they have six and two
callers outside the nav, so folding them in would break other pages.

## Why it is two files and not one

The request was one component. Next.js does not allow it: the nav needs
`await getDb()` and `getCurrentUser()`, which only a server component can do,
and it needs `useState` for every panel, which only a client component can do.
A single file cannot be both — `"use client"` is a whole-file directive.

So the split is the minimum the framework permits, and it is a data/paint line
rather than a feature line:

- **`components/Nav.tsx`** — server. Reads everything, decides nothing about
  appearance, renders exactly one element.
- **`components/nav/NavChrome.tsx`** — client. Every pixel, every panel, every
  piece of state.

No third file. Nothing in the nav renders from anywhere else.

## CMS keys — all nine must still be read

| Key | What it does |
| --- | --- |
| `brand.nav.bg` | the background art behind the whole header group |
| `brand.nav.planetsIcon` | art for the all-planets badge |
| `brand.nav.hidePlanets` | `"1"` hides the planets badge everywhere, bar and drawer |
| `brand.nav.marketplaceIcon` | art for the marketplace badge |
| `brand.nav.marketplaceLabel` | its label; defaults to `Trophy marketplace` |
| `brand.nav.marketplaceOrder` | `"before"` puts marketplace ahead of planets |
| `brand.nav.mode` | `mark` suppresses the drawer wordmark |
| `brand.logo` / `brand.wordmark` | the drawer lockup |
| `mobile.drawer.extra` | admin-defined extra drawer links |
| `chrome.nav` (`NAV_SETTING_KEY`) | the fourteen switches below |

`brand.logo` is only passed to the drawer when it is not the built-in
placeholder `/assets/logo.png` — that path is not a real file, and passing it
makes the drawer render a broken image instead of the gradient wordmark.

## The fourteen admin switches

From `lib/site-chrome.ts`. Each is per-audience (`guest` / `user`), and an
unset item uses **its own default**, not `true`.

`gameLogos`, `allPlanets`, `marketplaceBadge`, `questCard`, `alerts`,
`profileMenu`, `search`, `brandsLink`, `serversLink`, `loginLink`, `addBot`,
`discordSignIn`, `weekBand`, `mobileHud`.

Two rules that are easy to lose and were both hard-won:

- The mobile drawer passes `show: () => true` to `navBadges`. The per-audience
  switches govern the **bar**, which is a crowded row on a 390px screen; the
  drawer is the reachability surface. `hidePlanets` is still honoured there,
  because that setting says *hide it*, not *hide it from the bar*.
- `addBot` is wrapped in a `<span className="hidden lg:inline-flex">` rather
  than given the class directly. `AddBotButton` sets `inline-flex` itself, and
  which utility wins depends on stylesheet order, not on the class attribute.
  It lost, and the install button showed on phones and pushed the row
  off-screen.

## Behaviour the tests pin

`tests/db/nav.mts` and `tests/ui/week-band.mjs`:

- exactly **one** element paints the nav art. Three copies caused a visible
  seam where the bar met the strip.
- the week panel is `[data-week-panel]`, starts collapsed, and is opened by a
  `header button` whose text contains *Profile of the Week*.
- the podium is capped at three; everyone else is behind a *See all* link to
  `/vote` that says *N more in the running*.
- a place with a configured trophy renders `[data-prize]` with a real `<img>`,
  framed *if the week ended now*, and **never** as already won.
- every profile link in the band opens in a new tab and carries `noopener`.
- the panel leaves the page visible underneath it.
- no band anywhere under `/admin` — staff are signed in, the board opened by
  default, and a fixed panel swallowed every click in the card studio.
- `NAV_MENUS` renders in order, unfiltered; leaves are filtered, groups are not.
- the two destination badges render in the row, outside any dropdown, and stay
  admin-gated.
- *For brands* and *For Discord servers* are not breakpoint-hidden.

## Defects the rebuild is expected to fix

Reported against the live site, all confirmed in the old code:

| # | What |
| --- | --- |
| 1 | Neither band closes on navigation — state is `localStorage` only and `MissionBand` never knew the pathname, so a panel opened on one page covered the next one until manually collapsed. |
| 2 | The week panel is `max-h-[calc(100dvh-var(--nav-h))]` — the whole viewport. The UI test allows up to 92%, which is still most of a phone screen. |
| 3 | Mission tasks carry `{label, count, done, complete, cp}` and nothing else — no icon, no href, no quest key — so they cannot be clicked and cannot say which quest they belong to. |
| 4 | The expanded mission panel paints a 90%-opaque near-black scrim over the art, which reads as "the band lost its background". |
| 5 | The mission band shows no CP total, no wallet balance and no record of what was completed. |
| 6 | `/quests` does not show missions at all, and its first element is a raw `<a href="/rules/gamer">` — a full page load — sitting exactly where the open mission panel had been. |
