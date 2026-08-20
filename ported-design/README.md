# Ported design

Two files, carried deliberately from the v1 platform on `main`, with a reason
each. **Nothing else was taken, and no session should go back for more** — the
one rule in `CLAUDE.md` still holds. If something here is not enough, ask.

The v1 platform shipped a coherent, opinionated visual language that had already
survived contact with real users. v3 shipped five CSS variables. Rebuilding a
design system from nothing when a good one exists twenty commits away would be
inventing a second answer to a question already answered.

| File | Why it was taken |
|---|---|
| `globals.css` | 376 lines: the token set, the **semantic colour system**, surfaces, buttons, motion, and the scoped profile theming layer. The comments carry the reasoning, which is the part worth more than the values |
| `theme.ts` | 289 lines: the **entire gamer profile customization engine**. v3 has no profile customization at all, and this is a finished, shipped design for it |

---

## What to change on arrival

The v1 platform had quests, Cluster Points, a marketplace, a feed and planets.
v3 deleted all of it. So:

| # | Change |
|---|---|
| 1 | **`theme.ts`'s `SECTIONS` list is v1's.** `quests` and `badges` describe things that no longer exist. The section model is right; the sections are not — replace them with v3's: linked accounts, trophy case, challenges entered, standings, rank history |
| 2 | **`--color-gold` was Cluster Points.** Keep the token, repoint it: it is the podium's gold now, and it needs a silver and a bronze beside it |
| 3 | **`html { zoom: 0.9 }`** is a real decision that shaped every px value in v1. Keep it or drop it — but decide, and write down which, because half-adopting it makes every spacing value wrong |
| 4 | `.grad-text` "keeps its name because thirty-nine files call it". **Nothing in v3 calls it.** Rename it to what it is before anything depends on the wrong name |
| 5 | The `--font-grotesk` variable expects a font v3 does not load. Either load it or replace the stack — a missing display font degrades silently to system sans, which is exactly the failure trap 31 describes |

---

## What was deliberately left behind

`components/` on `main` holds 227 components. **None were taken.** Most render
quests, Cluster Points, the marketplace, the feed, planets, spaces, voting and
the follower graph — surfaces v3 deleted on purpose. Importing them would carry
the deleted product back in with the design.

Build v3's components on these tokens. Do not port a component to save time.
