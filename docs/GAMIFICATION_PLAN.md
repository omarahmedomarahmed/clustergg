# Cluster — Gamification & Quests Plan

> Turning Cluster from "a platform with badges" into **a cosmic space game that
> happens to be a platform**: every action is progress, every badge is a chapter,
> every profile is a trophy case. Badges are rebuilt from scratch as **Quests**.

This is a build spec — no code yet. It defines the model, the 4 Quests / 16
badges, the progression math, the admin surface, and the art pipeline.

---

## 1. Core concept

- **Quest** = a themed progression track. There are exactly **4 Quests**.
- Each Quest contains **4 badge tiers**: **Bronze → Silver → Gold → Platinum**.
  → 4 Quests × 4 tiers = **16 badges total** (down from today's ~13 ad-hoc badges).
- A Quest is *guided platform use*: it tells the gamer exactly what to do
  ("win 3 challenges", "follow 10 gamers", "connect 3 accounts", "get seen")
  and shows live progress toward the next tier.
- You **can't earn the same badge twice**, but the **actions that feed a Quest
  are repeatable** — every account you connect, every challenge you win, every
  ad you see pushes the Quest bar further, unlocking the next tier badge. That
  satisfies "earn more than one badge" and "if there's a badge for connecting an
  account they earn it many times": one *action* counts many times toward the 4
  tier badges of its Quest.
- Quests are the **main identity element** on a profile — a stacked deck of 4
  Quest cards, each showing its 4 tier badges + a progress bar.

### The 4 Quests (categories)

| # | Quest name (working) | Category | What feeds it | Theme |
|---|---|---|---|---|
| 1 | **Conquest** | Challenge wins & participation (game-agnostic) | Joining challenges, placing top-3, winning | Gold / arena / laurels |
| 2 | **Orbit** | Social interaction | Join planets, posts, comments, reactions, followers, **profile views**, messages sent | Violet / constellation / connection |
| 3 | **Ascension** | Linked game-account stat progression | # accounts connected + measurable stat growth **across all** of them | Cyan / data / ascension ladder |
| 4 | **Signal** | Ad views & impressions (passive) | Ad impressions this gamer generates while browsing/scrolling | Amber / broadcast / radar |

> Naming is a placeholder; final names/lore are **admin-editable** (see §6).

---

## 2. Progression math (one simple model for all 4)

Each Quest accrues **Quest Points (QP)**. QP come from **weighted actions**.
When cumulative QP crosses a tier threshold, the tier badge unlocks.

```
tierThresholds (default, per quest, admin-editable):
  Bronze   =   100 QP
  Silver   =   400 QP
  Gold     = 1,200 QP
  Platinum = 3,000 QP
```

**Action → QP weights** (defaults, per quest, admin-editable). Examples:

**Conquest**
- Join a challenge: +15 QP (repeatable, capped daily to stop farming)
- Finish a challenge (any place): +25 QP
- Top-3 finish: +150 QP
- 1st place: +400 QP

**Orbit**
- Join a planet: +20 QP · Write a post: +10 · Comment: +5 · Reaction given: +2
- Reaction *received*: +3 · New follower: +8 · Message a new gamer: +4
- Every 25 profile views: +10 QP

**Ascension**
- Connect a game account: +120 QP (repeatable → more games = more QP)
- Each stat "level up" detected on sync (rating/rank/trophies rising): +10–40 QP
  scaled by how much it moved (progression across *all* connected accounts).

**Signal**
- Per ad impression attributed to this gamer: +1 QP (daily cap, e.g. 60/day)
- Per ad click: +5 QP
- → "by just opening pages and scrolling, they earn."

QP is **monotonic** (never decreases). Anti-abuse: per-action daily caps +
dedup (same follower/post can't be re-counted). All caps admin-editable.

---

## 3. Data model

New/changed tables (all migrated via the existing self-healing
`COLUMN_MIGRATIONS` + `ddl.ts` pattern; seeded idempotently via `runBootMaintenance`):

```
quests                      -- 4 rows, fully admin-editable config
  id, key (conquest|orbit|ascension|signal), name, tagline, lore (long text),
  color, accent2, logo_url, card_bg_url, cover_url, icon,
  tier_thresholds jsonb {bronze,silver,gold,platinum},
  action_weights jsonb {actionKey: qp},
  daily_caps jsonb {actionKey: max},
  sort_order, is_active

badges  (REBUILT: exactly 16 rows)
  id, quest_key, tier (bronze|silver|gold|platinum),
  name, description (the "story" line for this tier),
  icon_url (uploaded art), threshold_qp (denormalized from quest for display),
  is_active
  -- unique (quest_key, tier)

user_quest_progress
  user_id, quest_key, qp int, current_tier text, updated_at
  -- PK (user_id, quest_key)

quest_events   -- append-only ledger for dedup + audit + "recent progress" UI
  id, user_id, quest_key, action_key, qp_awarded, ref_type, ref_id, created_at
  -- unique (user_id, action_key, ref_type, ref_id) where dedup matters
```

`user_badges` stays (records which of the 16 badges a user unlocked + when),
so profile display and the leaderboard are simple joins.

---

## 4. The Quest engine (server)

A single module `lib/quests.ts`:

- `awardQuestAction(db, userId, actionKey, { refType, refId })`
  1. Look up which quest owns `actionKey` and its weight + daily cap.
  2. Dedup via `quest_events` unique key (skip if already counted).
  3. Insert the event, `qp += weight` on `user_quest_progress`.
  4. Recompute `current_tier`; if a new tier crossed → insert `user_badges` row
     + notification ("🏆 Silver unlocked in Conquest!").
- Hook points (call `awardQuestAction`) at the existing action sites:
  - `linkGameAccount` / OAuth game-link → `ascension:connect_account`
  - challenge finalizer → `conquest:finish` / `conquest:top3` / `conquest:win`
  - challenge join → `conquest:join`
  - `createPost`/comment/reaction/follow/startConversation → `orbit:*`
  - profile view increment (already added) → batched `orbit:profile_views`
  - stat sync in `lib/sync.ts` when a metric rises → `ascension:stat_up`
  - ad impression beacon (`/api/ads/beacon`) → `signal:impression`
- Replaces `lib/badges.ts` `evaluateBadgesForUser` (retired; old criteria types
  removed). A one-time migration maps any legacy `user_badges` to nearest new
  tier or clears them.

---

## 5. Profile "Quests" section (main identity)

Replaces the current flat badge grid. A **stacked deck of 4 Quest cards**:

- Each card uses its Quest theme (color, `card_bg_url` gamified background art).
- Header: Quest logo + name + tagline + current tier chip.
- **A row of the 4 tier badges** (bronze→platinum). Unlocked = full color + glow;
  locked = dimmed silhouette. Shared centerpiece art per Quest, distinct
  layout/frame per tier.
- **Progress bar** to the next tier with `qp / nextThreshold` and the exact
  remaining action ("2 more wins → Gold").
- Tap a badge → modal with its **story** (lore line) + how it was earned.

Also:
- **Profile views** shown as a brag number (already shipped) — can be toggled
  private in settings (planned toggle: `show_profile_views`).
- Quests are placed high on the profile as the identity centerpiece, above game
  stat cards. Discord handle (identity) + Quests (journey) + game planets (play).

---

## 6. Floating Quest button (global)

- A **glorified floating orb** (bottom-right, above content) on every logged-in
  page — gamified art, subtle idle animation, pulses when progress is made.
- Hover/tap → panel: the 4 Quests, each with current tier + progress bar +
  "next step" hint. Clicking a Quest deep-links to the best action for it
  (e.g. Signal → keep browsing; Conquest → live challenges).
- Recently earned QP toast ("+150 QP · Conquest") slides from the orb.

---

## 7. Quest leaderboards (global)

- New `/quests` hub: the 4 Quest cards + a **global leaderboard per Quest**:
  - "**X gamers reached Platinum in Conquest**", full tier distribution.
  - Top questers by QP per Quest, and an overall "most decorated" board.
- On each **challenge page**: a banner — "Join & win → **+400 QP toward your
  Conquest Platinum badge** (you're 1,150 / 1,200 to Gold)." Ties challenges
  directly to Quest progress, as requested.

---

## 8. Admin — seamless, no JSON

Extends the no-JSON admin work already shipped. New `/admin/quests`:

- **Per-Quest editor** (4 of them), all visual:
  - Name, tagline, **lore/story** (rich text), theme color + accent.
  - Uploads (ImageUpload → Blob): Quest **logo**, **floating-card background**,
    **cover image**, and **each of the 4 tier badge icons**.
  - **Tier thresholds** (4 number inputs) + a live preview of the progress bar.
  - **Action weights & daily caps**: a table of the quest's actions with number
    inputs (no JSON) — exactly the visual-builder pattern from the challenge/
    badge builders.
  - Reorder Quests, activate/deactivate.
- **Badge story editor**: name + description ("path/story to reach it") per tier.
- Everything an admin uploads/edits (art, lore, thresholds, weights) is live —
  gamers see it immediately. Matches "full simple words, easy access."

---

## 9. Art direction & asset pipeline (cosmic space game)

Direction: **online cosmic-space game UI**. Every text container and icon
becomes gamified art — not flat cards. Produced with Higgsfield (nano_banana),
stored in Vercel Blob, all admin-replaceable.

**Per-Quest art set (×4):**
- 1 Quest logo/emblem (shared centerpiece motif).
- 4 tier badges (bronze/silver/gold/platinum) — same centerpiece, escalating
  frame/material/FX; identical canvas size for pixel-perfect swapping.
- 1 floating-card background (themed nebula/panel).
- 1 cover banner with room for a progress bar.
→ 24 Quest assets total, generated from **one unified prompt per Quest** with the
tier/word swapped, so the 16 badges read as a coherent family (same approach
proven on the LOL/Valorant planet skins).

**Gamified UI component art (global, reusable):**
- Stat-card / game-card / challenge-card / my-planet-card background frames.
- Button skins (primary/ghost/danger) as space-panel art.
- The floating Quest orb (idle + active states).
- Section container frames, dividers, and a set of custom cosmic **icons**.
- A custom **mouse cursor** (extends the existing recolorable cursor engine).

**Production method:** a documented prompt kit (`docs/asset-prompts/`) with a
locked style preamble + per-asset prompt, unified aspect/resolution per asset
class, imported to Blob via the upload pipeline. Admins can regenerate/replace
any asset without a deploy.

---

## 10. Build phases (proposed order)

1. **Model + engine**: tables, `lib/quests.ts`, migrations, retire old badges,
   seed 4 Quests + 16 badge rows (with placeholder art).
2. **Hooks**: wire `awardQuestAction` into challenges, social, links, sync, ads.
3. **Profile Quests section** + **floating Quest orb** + toasts.
4. **/quests hub + leaderboards** + challenge-page progress banners.
5. **Admin /admin/quests** (visual, no-JSON) — thresholds, weights, lore, art.
6. **Art pass**: generate the 24 Quest assets + gamified UI component art +
   cursor; wire as defaults; keep everything admin-replaceable.
7. **Polish**: mobile, animations, anti-abuse caps tuning.

---

## 11. Open decisions for sign-off

- Final Quest **names + lore** (I'll draft, you approve).
- Exact **thresholds & weights** (defaults above are a starting point).
- Whether **Signal** (ad-view Quest) is visible to all or opt-in (some may find
  "earn by viewing ads" too incentive-heavy — easy to gate).
- How aggressive the **art replacement** of core UI is in v1 (start with Quest
  assets + floating orb + cursor, then expand to all cards/buttons).
```
