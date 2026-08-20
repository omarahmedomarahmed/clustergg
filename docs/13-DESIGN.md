# The visual system

Everything the other twelve documents left out. They specify what a page **does**
and never what it **looks like**, which is why v3 shipped provably correct and
visually dead: five CSS variables, no logo, no `public/` directory at all.

The foundations are in `ported-design/`, carried from the v1 platform with a
written reason. Read that README before this.

---

## 1 · Colour carries information

The one rule the whole palette rests on, and the one most likely to be lost:

> There used to be one gradient on every headline, every button and every big
> number, which meant **nothing on the site could mean anything by being
> coloured.**

So each colour has a job, and no colour has two.

| Colour | Means | Used on |
|---|---|---|
| **Blue** `#38bdf8` / `#2563eb` | **The product** | Discord, the bot, gamers, challenges, joining |
| **Purple** `#a78bfa` / `#7c3aed` | **The business** | Brands, pricing, the brand portal, anything commercial |
| **Deep cyan** `#0e7490` | **Money** | Paying an invoice, releasing a payout, marking one paid, redeeming a trophy |
| Gold · silver · bronze | **The podium** | Trophies and placements, nowhere else |
| Red | **Live** | A running challenge, a countdown. **Never an error** |
| Amber | **Waiting** | Unpaid, unallocated, awaiting setup |

| # | Rule |
|---|---|
| D1 | **A click that has a number attached is the money colour.** Not the product colour, not the brand colour |
| D2 | The money button is **deep** cyan, never the bright token. A large filled surface in bright cyan reads as a glowing sticker rather than something you press, and it fails contrast against white — the wrong property for the one button that moves money |
| D3 | **Every colour passes WCAG AA on its own ground.** Checked, not assumed |
| D4 | A colour used for two things is worth less than a colour used for one. If a new meaning needs a colour, it takes one from this table or it does not get one |

### Tokens

| | |
|---|---|
| `--color-void` `#04051a` | Page ground |
| `--color-panel` `#0b0d26` | Cards |
| `--color-ink` `#e8eaf6` | Text |
| `--color-muted` `#9aa0c3` | Secondary text |
| `--color-violet` `#8b5cf6` · `--color-cyan` `#22d3ee` · `--color-magenta` `#e879f9` | Accents and gradients |
| `--color-gold` `#fbbf24` | **Repointed** — the podium, no longer Cluster Points |

---

## 2 · Surfaces and motion

`glass` · `glass-hover` · `nebula-bg` · `ring-orbit` · `float-y` · `pulse-glow` ·
`shimmer` · `ticker-track` · `rise-in` with a four-step stagger.

| # | Rule |
|---|---|
| D5 | **Motion is entrance and state, never decoration that loops in a reader's eye.** `rise-in` on arrival; `pulse-glow` on something live; nothing animating forever beside text somebody is trying to read |
| D6 | **Respect `prefers-reduced-motion`.** Every animation above has an off switch or it does not ship |
| D7 | A decoration may never take a page down — house rule 11, applied to visuals. Artwork, a font, a background image: **fence every one**, because the card renderer already proved the failure mode. It threw on every card for a sprint, the fence turned it into text, and both bands stayed green |

---

## 3 · The page that matters most

**`/pool`.** The platform's entire promise is that the pool is public — every
community can see exactly what each of them earned.

| # | Rule |
|---|---|
| D8 | `/pool` is the most designed page on the platform, and the reason somebody screenshots it into their server |
| D9 | It is designed **first**, and the rest of the site follows from it |

---

## 4 · What every surface owes

| # | Rule |
|---|---|
| D10 | **A real empty state with a next action.** Never a bare dash, never a blank panel |
| D11 | **Loading and error states are designed**, not defaulted |
| D12 | **Mobile is not a later pass.** Gamers are on phones — every page, not only the marketing ones |
| D13 | The **four nav states** are visually distinct: guest, gamer, server manager, brand |
| D14 | **A guest can find the door.** Sign in and Sign up are in the guest nav. They were not, and `/login` and `/signup` sat unreachable with nothing pointing at them |
| D15 | Discord cards are a visual surface too — `lib/cards` renders real images, and they are the first thing most gamers ever see of Cluster |

---

## 5 · The gamer profile is a product, not a page

v1 shipped a full customization engine. v3 shipped nothing. `ported-design/theme.ts`
is the design; this is the rule set.

| A gamer sets | |
|---|---|
| **Page** | Background colour · **background image** · blur 0–20px · dark overlay 0–90% |
| **Cover** | Image · height · overlay |
| **Avatar** | Size, and shape: circle, rounded, square, hexagon, heart, star, lightning |
| **Cards** | Panel colour · `glass` \| `solid` \| `outline` \| `flat` |
| **Buttons** | `neon` \| `solid` \| `outline` \| `glass` \| `pill` |
| **Type & colour** | Accent, second accent, text, muted, font, corner radius |
| **Cursor** | A preset or a custom image, with a tint |
| **Layout** | Section visibility, **section order**, and per-section background art |

| # | Rule |
|---|---|
| D16 | **Every field degrades to a sane default.** A missing value is never a broken page — that is what makes the engine safe to extend |
| D17 | Themes are **scoped to `.profile-root`** and render as CSS variables. A gamer's choices can never leak into Cluster's own chrome |
| D18 | The background image is a **separate fixed layer**, never `background-attachment: fixed` — v1 found that made long customized profiles scroll badly |
| D19 | **Uploads go through the same door as everything else** — `acceptImage`, WebP converted, stored in Blob. A profile background is not a special case |
| D20 | A theme is a **small JSON blob with a version stamp**, read forgivingly and never discarded on a version mismatch |
| D21 | **Sections are v3's, not v1's.** Linked accounts, trophy case, challenges entered, standings, rank history. Quests, Cluster Points and badges do not exist |

---

## 6 · Assets that must exist

`public/` does not exist in v3 at all. It needs: a **logo** (light and dark), a
**favicon**, an **OG image**, **game art** per provider, **trophy art** per tier,
and a **default server avatar** and **default profile cover**.

| # | Rule |
|---|---|
| D22 | Every image is served from `public/` or Blob. **Never a hotlink** to a provider's CDN — it breaks and it is somebody else's bandwidth |
| D23 | **A missing asset renders a designed placeholder**, never a broken-image icon and never nothing |
