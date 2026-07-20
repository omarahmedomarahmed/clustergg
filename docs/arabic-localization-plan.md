# Arabic Localization — Full Implementation Plan

Goal: every piece of text on ClusterGG can be shown in **Arabic** or **English**,
the layout is preserved (mirrored for RTL where it matters), a gamer picks their
language during onboarding and can flip it any time from a **flag toggle in the
nav** (🇪🇬 Arabic / 🇺🇸 English), and **admins can edit every Arabic string** exactly
like they already edit English content today.

This plan is written against the code as it stands so it can be executed in
order. Nothing here changes the visual design — only the language of the words.

---

## 1. Two kinds of text (they need different mechanics)

| Kind | Where it lives today | Example | Localization mechanic |
| --- | --- | --- | --- |
| **A. CMS content** | `platform_settings` via `lib/cms.ts` (`CONTENT_DEFAULTS`) | hero title, section headings, footer tagline, brand copy | Add a parallel Arabic value per key |
| **B. Database rows** | `games`, `spaces` (planets), `quests`, `challenges`, `leaderboards`, `trophies`, `badges`, quest milestones/tiers | a challenge's title + "how to win", a quest's story, a planet's description | Add Arabic columns / a translations table |
| **C. Hard-coded UI strings** | JSX in components (`"Explore planets"`, `"Mark all read"`, button labels) | nav, buttons, empty states, form labels | Extract to a typed dictionary (`lib/i18n`) |
| **D. External / real data** | Riot/Data-Dragon/valorant-api names (champion names, ranks) | "Challenger", "Wraith" | Leave as-is (proper nouns) or optional glossary overrides |

The platform already has a strong CMS + admin-edit surface, so **A** and **B**
reuse existing patterns; **C** is the only genuinely new surface.

---

## 2. Locale foundation (do this first)

### 2.1 Locale type + resolution
- New `lib/i18n/locale.ts`:
  - `export type Locale = "en" | "ar";`
  - `export const LOCALES: {code: Locale; label: string; flag: string; dir: "ltr"|"rtl"}[]`
    — `en` → 🇺🇸 LTR, `ar` → 🇪🇬 RTL.
  - `resolveLocale(cookieValue, userPref)` → `Locale` (default `en`).
- Persistence:
  - Cookie `cluster_locale` (1-year, `lax`), set by the toggle + on onboarding.
  - Column `users.locale text default 'en'` (self-healing `ALTER … IF NOT EXISTS`
    in `COLUMN_MIGRATIONS`, `lib/db/index.ts`) so a signed-in gamer's choice
    follows them across devices. Cookie wins for guests; user column wins for
    members and is written whenever they toggle.
- `getLocale()` server helper (reads cookie via `next/headers`, falls back to the
  signed-in user's `locale`). Mirrors the existing `getCurrentUser()` pattern.

### 2.2 RTL layout
- In `app/layout.tsx`, make `<html lang>` + `dir` dynamic:
  `const locale = await getLocale();` → `<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>`.
- Tailwind is already logical-property-friendly in most places, but audit for
  hard-coded `left/right`/`ml-/mr-/pl-/pr-`/`text-left`. Strategy:
  - Prefer logical utilities (`ms-`/`me-`/`ps-`/`pe-`/`text-start`/`text-end`).
  - Add a small `rtl:` audit pass on the ~15 layout-critical components
    (Nav, BottomNav, MobileMenu, PlanetExplorer sidebars, profile builder).
  - Directional **icons** (arrows, chevrons) get flipped with a `rtl:-scale-x-100`
    utility class on a shared `<DirIcon>` wrapper.
- Font: bundle an Arabic-capable webfont (e.g. **Cairo** or **IBM Plex Sans
  Arabic**) via `next/font/google`, applied when `dir==="rtl"`. Keep Space Grotesk
  for Latin. Numbers stay Western-Arabic (0-9) unless the admin opts into Eastern
  numerals (a single CMS flag).

### 2.3 The language toggle (nav + onboarding)
- New `components/LocaleToggle.tsx` (client): shows the **current** flag; clicking
  swaps locale → writes the cookie (server action `setLocale(locale)` which also
  updates `users.locale` when signed in) → `router.refresh()`.
- Placement:
  - **Nav** (`components/Nav.tsx`): always-visible flag button next to the
    notification/DM cluster (and inside `MobileMenu` for small screens).
  - **Onboarding** (`app/onboarding/page.tsx`): a prominent 🇺🇸/🇪🇬 choice near the
    top, written to the cookie + user row before the gamer proceeds.

---

## 3. Content model — how Arabic strings are stored & edited

### 3.1 CMS content (Kind A) — the cheapest win
`lib/cms.ts` already maps `key → string`. Localize by **namespacing the key by
locale** so nothing else changes:

- Storage key becomes `"<key>@ar"` for Arabic; English keeps the bare key.
- `getContent(keys, locale)` gains a `locale` arg: for `ar` it first looks up
  `"<key>@ar"`, and **falls back to the English value** (then to
  `CONTENT_DEFAULTS`) when no Arabic override exists — so the site is never blank
  while translation is in progress.
- `setContent(key, value, locale)` writes the namespaced key.
- `CONTENT_DEFAULTS` stays English-only; optionally add `CONTENT_DEFAULTS_AR`
  seeded with a first-pass Arabic translation so the site ships usable Arabic on
  day one (still admin-overridable).

**Admin editing:** every existing CMS editor (brand kit, section text, page
copy) gets a **language tab / segmented control (EN | ع)** at the top. Switching
the tab loads/saves the `@ar` variant through the same forms and server actions
that already exist — no new admin pages, just a locale param threaded through.

### 3.2 Database rows (Kind B) — translations table
Add **one generic translations table** rather than doubling every column
(scales to any future locale, keeps row size down, avoids a migration per field):

```
content_translations (
  id, locale text,            -- 'ar'
  entity_type text,           -- 'challenge' | 'quest' | 'game' | 'space' | 'leaderboard' | 'trophy' | 'badge' | 'quest_milestone' | 'quest_tier'
  entity_id text,
  field text,                 -- 'title' | 'description' | 'rules_text' | 'prize' | 'name' | 'story' ...
  value text,
  updated_at,
  unique(locale, entity_type, entity_id, field)
)
```

- Loader `t(entityType, id, field, locale, fallback)` → Arabic value or the
  original English `fallback` (so nothing is ever blank).
- A tiny `localizeRows(rows, entityType, fields, locale)` helper batch-loads all
  translations for a page in one query and maps them onto the rows before render
  (keeps it to a single extra query per page, no N+1).

**Admin editing:** every entity editor that already has a title/description field
(challenge builder, quest editor, planet/game editor, leaderboard title, trophy,
badge) gets the same **EN | ع tab**. The ع tab reads/writes
`content_translations` for that row via one new server action
`saveTranslation(entityType, id, field, locale, value)`. This is additive — the
English write path is untouched.

### 3.3 Hard-coded UI strings (Kind C) — dictionary
- New `lib/i18n/strings.ts`: a typed dictionary
  `const STRINGS = { en: {...}, ar: {...} }` keyed by short ids
  (`nav.home`, `challenge.howToWin`, `common.markAllRead`, …).
- `useT()` (client) / `getT(locale)` (server) return `t("nav.home")`.
- Migration is mechanical: sweep components, replace literals with `t("…")`.
  Scope it in waves by surface (nav/footer → planet hero → feed → profile →
  admin) so it's reviewable.
- **Admin editability of UI strings too:** the dictionary's Arabic layer is
  *overlaid* by CMS — `t()` checks `content_translations` (entity_type `'ui'`,
  field = string id) first, then the built-in `ar` dictionary, then `en`. So the
  built-in Arabic is a sensible default and an admin can still correct any label
  from an **Admin → Language → UI strings** table (searchable list of every id
  with EN reference + editable ع field).

---

## 4. Admin surface — "Admin → Language"
A single new admin area (guarded by a new `language` RBAC area in `lib/areas.ts`):
1. **Overview**: % translated per surface (CMS keys, each entity type, UI
   strings), with "untranslated" filters so staff can see exactly what's left.
2. **UI strings table**: every `strings.ts` id, English reference, editable
   Arabic, search + "missing only" filter.
3. **Bulk tools**: export/import a CSV/JSON of all strings for an outside
   translator, re-import to fill `content_translations` + `@ar` CMS keys.
4. Per-entity editing stays **in place** on each existing editor (the EN | ع
   tab), so translating a challenge happens right where you edit the challenge —
   this is the "every quest page, every challenge page editable" requirement.

Optional accelerator: a "Draft Arabic with AI" button per field that pre-fills
the ع field with a machine translation for staff to review (never auto-publishes).

---

## 5. Rendering rules
- Server components call `getLocale()` once and thread `locale` into
  `getContent(..., locale)` and `localizeRows(..., locale)`.
- Client components read locale from a `LocaleProvider` (React context seeded by
  the server value) so `useT()` works without prop-drilling.
- **Fallback chain everywhere:** Arabic override → English content → default.
  The site is fully usable in Arabic from the first translated string and
  degrades gracefully, never blank.
- Proper nouns (game names like "VALORANT", champion/legend names, rank tiers
  from Riot) render untranslated by default; an optional glossary
  (`content_translations` entity_type `'glossary'`) lets admins localize specific
  terms (e.g. "Challenger" → "المُتحدّي") if desired.

---

## 6. Delivery phases (each shippable on its own)

1. **Foundation** — locale type, cookie + `users.locale`, `getLocale()`, `<html
   dir>`, Arabic font, `LocaleToggle` in nav + onboarding, `setLocale` action.
   *Outcome:* the toggle flips dir/font and persists (UI still English).
2. **CMS Arabic (Kind A)** — `getContent/setContent` locale param + `@ar` keys +
   EN|ع tabs on the CMS editors + first-pass `CONTENT_DEFAULTS_AR`.
   *Outcome:* all marketing/section copy translatable & admin-editable.
3. **UI dictionary (Kind C)** — `strings.ts` + `useT`/`getT` + `LocaleProvider`,
   migrate nav/footer/bottom-nav/planet-hero/feed first.
   *Outcome:* core chrome fully Arabic.
4. **DB translations (Kind B)** — `content_translations` table + `localizeRows` +
   `saveTranslation` action + EN|ع tabs on challenge/quest/planet/leaderboard/
   trophy/badge editors.
   *Outcome:* every challenge/quest/planet/leaderboard shows Arabic.
5. **Admin → Language** — overview, UI-strings table, CSV export/import, optional
   AI draft.
   *Outcome:* staff can find and fix any untranslated string in one place.
6. **RTL polish** — component-by-component `rtl:` audit, icon mirroring, form
   alignment, number/date formatting (`Intl` with the `ar` locale).
   *Outcome:* pixel-clean Arabic layout.

---

## 7. Effort & risk notes
- **Biggest surface:** Kind C string extraction (mechanical but touches many
  files). Do it in reviewable waves; a lint rule can flag new hard-coded literals
  later so English strings don't creep back in.
- **Lowest risk:** Kinds A & B reuse the existing CMS + admin-edit machinery —
  they're additive and never touch the English write path.
- **Data-transfer:** `content_translations` is small text; batch-load per page
  (one query) to avoid N+1 and keep Neon transfer flat.
- **No design change:** layout is preserved; only direction mirrors under RTL and
  the font swaps. Everything stays admin-editable, matching how English works
  today.
