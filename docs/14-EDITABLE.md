# What a human can change without a deploy

The omission this document exists to correct: `05-ADMIN` §8 names four pages in
four table rows and never says any of them **edits** anything. A session read
*"Bot card layouts"* and built a page that tells you about bot card layouts.
That was a fair reading of what was written.

`04-SURFACES` lists `/profile` and never says what is on it. So there is no
profile.

**The rule this whole document follows:** naming a page is not specifying it.
Every row below says what a human can *do*, because trap 24 is right — *"a human
can" is not the last line of a sprint table, it is the definition of done.*

---

## 1 · The rule that has to come first

The moment an operator can type copy, the guard that stops a **page** retyping a
figure stops covering anything. Somebody types *"$700 a challenge"* into a
content key and it is live and it is wrong.

That is not hypothetical. It is the failure this entire branch was created after:
**a document quoting an owner's withdrawal floor at twice its real value.** It
was not lying — it was a copy of a number that had moved.

| # | Rule |
|---|---|
| E1 | **A saved copy value containing a currency amount, a percentage, or a threshold is refused at save, with the reason and with the key that already carries it.** Figures come from `SAYS`, which takes them from the module that enforces them |
| E2 | The refusal names the alternative. *"Prices are set in one place. Use `{price}` and it will always be right."* A refusal that only says no gets worked around |
| E3 | Same for a **rule stated in words** — `07` N3. An operator may not type the attribution sentence any more than a component may |
| E4 | **Every edit is a new row, never an overwrite**, with who and when. The previous value is one click away, because the fastest fix for bad copy is the copy from before it |

---

## 2 · `/admin/content` — the copy editor

**A human can:** search every key, read its default beside its current value,
edit it, preview it in place, revert it, and see who changed it and when.

| # | Rule |
|---|---|
| E5 | The page shows **both halves and marks them apart**: `COPY`, which can hold no figure at all, and `SAYS`, whose sentences take one. An operator needs to see which strings are safe to edit and which are computed |
| E6 | A key with **no override reads as its default**, and says so. Deleting an override is a first-class action, not an edit to blank |
| E7 | An edit is **live on save**. There is no deploy in this loop — that is the whole point of the store existing |

---

## 3 · `/admin/cards` — the bot card editor

The current page is a **diagnostic** — what is registered, which families are
owner-only, which fonts are installed. That page is genuinely useful and it
stays. It gains an editor beside it.

**A human can:** open any card family, set its **background art**, its **accent
colour** and its **layout variant**, and see a **real rendered preview** before
saving.

| # | Rule |
|---|---|
| E8 | The preview is **rendered by the same code that renders the card** — a real image, never an HTML mock. Two renderers is how a preview starts lying |
| E9 | **Artwork is a decoration and is fenced.** Bad art degrades the card; it never takes it down. This already happened: the renderer threw on every card for a sprint, the fence turned them all into text, and both bands stayed green |
| E10 | A saved layout is **asserted to still render** before it goes live. A card family that cannot render is refused at save, not discovered by a gamer |
| E11 | **WebP is converted on upload**, per `10-SETUP` §8 — the renderer cannot decode it, and a WebP background is a silently broken card |
| E12 | **An admin card is never a public message**, whatever the layout says. S8 is not a layout property |

---

## 4 · Page background art

New. There is no concept of per-page art anywhere in v3.

**A human can:** set a background image, an overlay strength and a focal point
for any public page, and clear it back to none.

| # | Rule |
|---|---|
| E13 | Art is set **per page key**, stored beside content, and is **always optional**. Every page must look finished with none |
| E14 | **Overlay is part of the setting, not a guess.** Art without a readability overlay is how text becomes unreadable on somebody else's screen |
| E15 | **Fenced.** A background that fails to load leaves the page intact — house rule 11 |
| E16 | It goes through the same upload door as everything else: `acceptImage`, converted, stored in Blob |

---

## 5 · The gamer profile

Specified in `13-DESIGN.md` §5. Repeated here because it is the largest thing a
non-admin can edit, and because it was lost entirely.

**A gamer can:** customize their public page — background, cover, avatar shape,
card and button style, colours, font, radius, cursor, and which sections appear
and in what order.

| # | Rule |
|---|---|
| E17 | A gamer's theme is **scoped** and can never leak into Cluster's chrome |
| E18 | **Every field degrades.** A missing value is a default, never a broken page |
| E19 | The builder shows a **live preview of their own page**, not an abstract form |

---

## 6 · What stays read-only, on purpose

| Page | Why |
|---|---|
| `/admin/weeks` and its children | A closed week is a record. **A figure that disagrees with `server_payouts` is a defect to alert on, never a number to quietly correct** — `05` §6 |
| `/admin/vaults/ledger` | Append-only. A correction is a new row |
| `/admin/servers/[guildId]` audit | The same reason a log is a log |

| # | Rule |
|---|---|
| E20 | **Editable is a decision, not a default.** A page that shows money that has already moved is read-only unless somebody wrote down why it is not |

---

## 7 · Two pages `04-SURFACES` names that do not exist

Found by comparing the built routes against the document rather than by anything
failing — the reachability guards cannot see a page nothing links to, because
nothing links to it.

| Route | What it is |
|---|---|
| **`/brands`** | Where a brand signs up. `04-SURFACES` §3 step 1 and `06-JOURNEYS` §3 step 1 both start here. **The entire brand acquisition funnel has no front door** |
| **`/servers`** | The server index. `/servers/[slug]` exists and there is nothing above it |

| # | Rule |
|---|---|
| E21 | A guard asserts **every route `04-SURFACES` names resolves** — the same shape as the API-route guard, which already reads its list out of the document. Page routes were never given the same treatment |
