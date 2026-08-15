# Identity, attribution and permissions

Who somebody is, which server gets the credit for them, and who is allowed to
touch money. Ratified 2026-08-15.

**Read this alongside `02-MONEY.md` §4.** The KPIs there depend on the
attribution rules here, and neither is correct without the other.

---

## 1 · Two kinds of account, and three things a person can be

There are exactly **two account tables**. Everything else is a capability on top
of a gamer row.

| Account | Signs in with | Table |
|---|---|---|
| **Gamer** | **Discord, or email + password.** Either. Both, if they link the other later | `users` |
| **Brand** | **Email + password only. Never Discord** | `brand_users` |

| A person can be | Which is | Needs |
|---|---|---|
| **A gamer** | A `users` row | Onboarding |
| **A server manager** | **The same `users` row** | A linked Discord identity that Discord says admins that guild |
| **Cluster staff** | **The same `users` row** | A staff grant from the super admin |
| **A brand** | A `brand_users` row | A redeemed one-time invite |

**A staff member is a gamer.** They onboard like everyone, link an account,
enter challenges and win trophies. The grant opens the console; it does not
change what they are.

**A server owner is a gamer.** They may sign up by email and never touch
Discord — we simply will not know they own a guild. The moment they link
Discord, we see it, and the portal that was already waiting opens.

| # | Rule |
|---|---|
| I1 | **Two ways in, one row.** Discord sign-in **or** email + password. Either reaches every gamer surface; neither is second class |
| I1a | An **email gamer needs no Discord** — they onboard, enter, score, win and redeem. They have **no parent server**, and no server earns from them until they get one |
| I1b | A **Discord gamer needs no email** until they redeem |
| I1c | Linking the second method **never creates a second row, and never merges two accounts** |
| I1c1 | An identity already on another account is answered with a **route, not a refusal**: *"You already have a Cluster account — sign in with Discord to reach it."* |
| I1c2 | **One person may hold two accounts forever, and that is fine.** No merge exists, none is planned, and no support path combines them |
| I1c3 | **Each account is a separate gamer with its own onboarding and its own gates** — age, country, linked account, redemption email, trophies. Nothing crosses |
| I1c4 | The two **cannot share a game account**, because L1 makes a game account unique across all gamers. That is what stops one person scoring twice, and it needs no merge to work |
| I1d | **Password reset** exists for gamers and for brands. It is the only thing an unverified email cannot do |
| I2 | Brands and gamers use **separate login routes and separate tables**. One email could otherwise be both, and a brand landing in gamer onboarding is a mess |
| I3 | One brand, one login. Never one user across brands. Shared credentials are acceptable for now — **every spend is logged with timestamp and IP** so a disagreement has an answer |
| I4 | A gamer is never linked to a brand, never represents one, never sees a brand nav |

### The first bot click

Pressing **any** bot button creates an account immediately, so every screen after
it knows who they are.

| # | Rule |
|---|---|
| I5 | That first record holds **nothing but the Discord ID**. No name, no avatar, nothing |
| I6 | It accrues nothing and counts as nobody until onboarding completes |
| I7 | **The age question comes before any other data is stored.** We do not hold data on a child we never asked about |
| I7a | The **email path verifies the email at signup**, because it *is* the credential and a password reset is impossible without it. That verification is the one redemption later requires — it is never asked twice |

---

## 2 · Onboarding — one page, two paths

First full screen: **"Are you a gamer, or a server owner?"** Visual, with real
screenshots, skippable.

| Path | Shown | Then asks |
|---|---|---|
| **Gamer** | Custom profile · link game accounts · challenges · trophies | Age band → country → **link a game account** |
| **Server owner** | Link your members · unlock earning · climb the pool · win money | Age band → country → **`guilds` scope** → pick a server you admin → add the bot |

| # | Rule |
|---|---|
| I8 | Both paths ask **age band and country**. Same answer, one person, used for their gamer profile **and** every server they own |
| I9 | Either path always says they can be the other one too, at any time |
| I10 | **`guilds` is requested here, never at signup.** Signup stays frictionless |
| I11 | A progress bar on every step |

### Capability gates, not role gates

| To do this | Needs |
|---|---|
| Browse, read the pool, read standings | Nothing |
| **Enter a challenge** | Age + country + a linked game account, **proven if the game supports it** |
| **Open a server portal** | Discord sign-in + admin rights on that guild |
| **Withdraw** | Age 18+ · country · **be the guild owner** |
| **Redeem a trophy** | Age 18+ · country · verified email |

An owner who plays none of our games can still be paid. A gamer who manages
nothing is never asked about servers.

---

## 3 · Attribution — parent and join

Two servers can earn from one gamer. Never more.

| Term | Meaning |
|---|---|
| **Parent server** | Where they **first pressed any bot button**. Permanent |
| **Join server** | Where they pressed **Join** on that particular challenge |

| # | Rule |
|---|---|
| A1 | The parent is stamped at the **first click**, and counts once onboarding completes — **wherever** it completed |
| A1a | **The parent is frozen onto the entry the same moment the baseline is** — at the gun for an early joiner, at Join for a mid-week joiner. `max(challengeStart, joinedAt)`, one rule for both |
| A1b | So an admin correcting a gamer's parent in week 6 **cannot move week 3's money.** A closed week never moves |
| A2 | Click in server A, finish onboarding in server B or on the web → **A is the parent**. One account, one parent, no double counting |
| A3 | **Linked member count → parent server only** |
| A4 | **Entrant credit → ½ parent + ½ join server** |
| A5 | **Parent = join server → 1.0 to that one server.** Not two halves |
| A6 | Web join with no server context → **1.0 to parent** |
| A7 | No parent at all → they can do everything; **no server earns anything** |
| A8 | A gamer can **never** change their own parent. Cluster admin can, logged |
| A9 | Parent server loses the bot → their credit **freezes**. Keeps what it earned, gains nothing new |

### No parent yet

A gamer who signed up on the web has no parent. They are **not blocked** — they
link, enter, win and redeem exactly like anyone else.

They see: **"No parent server yet."** With: *open Discord, go to a server that has
Cluster and use `/cluster` — that becomes your parent.* The bot detects what
stage their account is in and continues from there.

### Why this shape

The parent rewards **acquisition** — getting somebody onto Cluster at all. The
join server rewards **conversion** — getting them into this particular challenge.
Capping at two makes concentrating gamers in fewer servers better for an abuser
than spreading them, so the incentive already points where we want it and needs
no policing.

---

## 4 · Eligibility — frozen at the gun, KPIs live

The distinction that makes the week coherent.

| What | When measured |
|---|---|
| **Eligibility** — *is this server in the pool at all?* | **Frozen at Monday 00:00 UTC.** `linked ≥ 10` **and** complete server profile |
| **All three KPIs** — *how much do they earn?* | **Live all week**, final at Friday's close |

All sponsored challenges share one gun, so this is **one check per week**, not one
per challenge.

| Case | Outcome |
|---|---|
| Eligible at the gun, links 50 more mid-week, 30 enter | **All 30 count, live.** Denominator grows to 60 |
| 8 linked at the gun, links 50 on Tuesday | Not in this week's pool. Entrants recorded, earn nothing. **Eligible next Monday** |
| 10 at the gun, one leaves Wednesday → 9 | **Stays in this week.** Re-checked next Monday |
| Gamer enters from an ineligible server | Recorded. That server earns nothing this week |

| # | Rule |
|---|---|
| E1 | **The conversion denominator is live, not the gun snapshot.** Frozen at 10 while entrants grow would let a server score 3.0 — an unbounded ratio that rewards poaching |
| E2 | The portal always shows **two states**: *"In this week's pool"* and *"On track for next week"* |
| E3 | Never re-check eligibility mid-week. What the pool page shows on Wednesday is what pays on Friday |

---

## 5 · Server profile — required to enter the pool

Ten linked members is not enough. A server we cannot describe is one we cannot
sell.

| Field | Note |
|---|---|
| Member age range | **Their members' ages** — clearly labelled, and nothing to do with the owner's own age band |
| Games their members play | |
| One-line bio | |
| Permanent invite link | Shown publicly and on their community-challenge pages |
| Cover image | Their public server page |
| Announcement channel | |

**The owner's age band and the server's member age range are two different
questions, asked in two different places, and neither is ever a substitute for
the other.** The owner's is asked once, of them, during onboarding. The server's
is profile information.

Progress is shown as a bar: *"4 of 6 done · 6 more linked gamers to unlock the
pool."*

---

## 6 · Who may touch money

| Action | Guild owner | Administrator / mapped role |
|---|---|---|
| View standings, analytics, members | ✅ | ✅ |
| Re-announce challenges | ✅ | ✅ |
| Edit the server profile | ✅ | ✅ |
| Add the bot | ✅ | ✅ |
| **Request** a community challenge | ✅ | ✅ |
| **Approve** a community challenge spend | ✅ | ❌ |
| **Withdraw** | ✅ | ❌ |

| # | Rule |
|---|---|
| P1 | **Only the Discord guild owner touches money.** One person |
| P2 | Access is by **ADMINISTRATOR permission** *or* a role the owner maps by hand |
| P3 | **Store the role ID, not the name.** A renamed role must not silently revoke access |
| P4 | The guild owner's portal **exists before they ever sign up**. Everything admins did is logged and waiting |
| P5 | A 13–17 owner **earns and cannot withdraw** — but **can** spend the balance on community challenges. Exposure now, cash at 18 |

### The owner who never appears

| When | What happens |
|---|---|
| Bot installed | **DM the guild owner**: Cluster is on your server, admins can create challenges from your earnings, only you can approve them |
| Every week close | **DM** with that week's earnings |
| After they sign in once | **Also email**, weekly |
| **4 weeks, never signed in** | **Cluster admin may reassign** — manually, never automatically, and the claimant must still hold ADMINISTRATOR at that moment |

**We cannot email a guild owner before they sign in.** Discord never gives us an
address. DM only until then.

**A DM can fail** — a guild owner who blocks DMs from server members never
receives it, and Discord says so quietly. A failed DM is a **recorded state the
guild registry shows**, never an error swallowed on a background path.

### Ownership transfer

| # | Rule |
|---|---|
| T1 | Detected on refresh or sign-in |
| T2 | The **old owner is notified and must confirm** |
| T3 | **14-day timeout** — no response, Cluster admin arbitrates |
| T4 | Withdrawal is **frozen for 7 days** after a confirmed transfer |
| T5 | Without a timeout, a vanished or hostile old owner locks the money forever |

---

## 7 · Knowing who left, without polling

Never on a schedule. Membership is checked only where it decides money.

| When | How | Cost |
|---|---|---|
| **Every bot interaction** | Discord's payload **contains the member object** — proves membership and gives current roles | **Free** |
| **At challenge entry** | `GET /guilds/{id}/members/{user_id}` — 404 means they left | 1–2 calls |
| **At the weekly close** | Re-check only servers at or near the gate | ~10–50 per server, weekly |
| **Admin refresh button** | One guild, on demand, with a cooldown | 2 calls |

**Never list guild members on any path the product depends on.** `GET
/guilds/{id}/members` pages at 1,000 and needs the GUILD_MEMBERS privileged
intent. Resolve one member on demand instead — same answer, 25× fewer calls.

There is **one exception, and it is opt-in per server**: the analytics tab in
§7a. Nothing in the weekly cycle may ever depend on it.

**What we accept:** a member who left still counts until the next checkpoint. One
week of drift at worst, and the close corrects it. Credit stands for the week
they entered.

---

## 7a · Server analytics — granted once, refreshed on demand

A server owner hands us read access to their member list **in exchange for their
own analytics.** They choose. If they never do, nothing about their earning,
their pool position or their portal changes — they simply do not get the tab.

### What they get

A dashboard of **their own server**: member counts over time, roles and who
holds them, how many of their members are linked to Cluster, entrants and how
they convert, activity against challenges. Read only. **They cannot manage their
server, their members or their roles from Cluster, and the page says so.**

Cluster admin sees the same snapshot on the guild registry, stamped with when it
was taken.

### The grant

| # | Rule |
|---|---|
| N1 | **Granted once, per server. It does not expire.** Signing out changes nothing — the bot keeps its access and we keep the snapshot |
| N2 | Before the grant, the tab exists and is **empty**, showing what they would get behind an **Allow analytics** button |
| N3 | After the grant, the page shows a plain warning: this contains **detailed information about your members**, do not open it with somebody looking over your shoulder |
| N4 | It also says, in words: **we do not read your member list for anything else** — not for scoring, not for the pool, not for eligibility. Only here |
| N5 | Every read is a **snapshot stamped with the date and time it was taken**. Neither the owner nor admin ever sees an undated number |
| N6 | The last snapshot is **always readable**. It is data we already hold. **Update** is what costs a call |

### The refresh, and the ceiling

The whole point of the Update button is that a stale snapshot is worth less than
a fresh one, so owners refresh it themselves — and every refresh is a member-list
pull we have to pay for.

| # | Rule |
|---|---|
| N7 | **Cooldown on Update, on the guild.** Never on the session. Signing out and back in is not a way around it |
| N8 | **A hard ceiling across every server at once.** As the platform approaches Discord's limit, the cooldown lengthens **everywhere**, and a server that cannot refresh right now is told plainly why and when it can. Until then it reads its last snapshot, dated |
| N9 | Nothing in the weekly cycle — eligibility, a KPI, the pool, a payout — may **ever** read a snapshot. **Delete the table and every dollar is identical.** Otherwise a server changes its own earnings by pressing a button, and the number it competes on depends on how often it refreshed |

### Two things about the permission itself

**The GUILD_MEMBERS intent is app-wide.** One switch, every guild, no per-guild
control. So per-server consent is **our gate, not Discord's** — a rule we keep in
code. The page therefore says *"we do not read this unless you ask us to"*, and
never *"we cannot"*, which would be a promise the architecture cannot keep.

**Past roughly 100 servers with the intent active, Discord reviews the bot.**
Analytics shown to the server's own owner is a normal, approvable use, and
nothing here violates their terms — no scraping, no resale, no cross-server
profiling, and no KPI that measures Discord activity (K4). Expect the review;
do not be surprised by it.

---

## 8 · The guild registry — an admin page

Everything about every server, in one place. This is the page opened when an
owner asks *"why am I not earning?"*

| Section | Shows |
|---|---|
| **Ownership** | Guild owner (ID + name) · **has the owner ever signed in** · transfer state · 14-day timer · 4-week reassignment clock |
| **Who installed it** | The user who added the bot, their role at the time, whether they were the owner |
| **Permissions** | Every role carrying ADMINISTRATOR · the mapped role, ID **and** current name · **everyone we have seen holding it**, with when we saw them, labelled as exactly that |
| **Pool eligibility** | Linked members vs 10 · profile completeness, field by field · in this week's pool, yes or no |
| **Money** | Balance · this week's share · payout history · pending community-challenge requests |
| **Refresh** | One button, per guild, cooled down. Re-pulls owner and roles from Discord |
| **Analytics** | Whether this server has opted in · the **last snapshot and when it was taken** · the cooldown state. Full role holders where they opted in, *seen-only* where they did not |
| **Audit** | Every admin action on this server, timestamped |

| # | Rule |
|---|---|
| G1 | **"Who installed the bot" is captured at the install redirect or lost forever.** Discord's API will never tell us afterwards |
| G2 | If they are not signed in at install, sign them in first, then redirect back with the guild still selected |
| G3 | Refresh pulls **owner + roles only**. Never the member list |
| G5 | **Role holders are accumulated from interaction payloads**, never listed. The page says so in words: somebody who holds the role and has never pressed a button will not appear. We do not take the GUILD_MEMBERS intent to close that gap |
| G4 | Admin can manually set any gamer's **age band** and **parent server**, from the list of servers that gamer is in |

---

## 9 · Growth — inviting the bot

| Situation | What they see |
|---|---|
| They admin the server | **Add Cluster** — the install link pre-selects that guild |
| They do **not** admin it | *"You're not an admin here, so you can't install Cluster — but you can recommend it."* |

The recommendation is an **editable, humanised, one-server-at-a-time message**
that pulls in the server's name and carries a disclaimer that they are not trying
to spam. The gamer edits it before copying. The template is CMS-editable.

**Never a bulk list with a copy button on each.** That is how a gamer gets banned
and Cluster's name gets attached to spam.

---

## 10 · Nav

| Surface | Nav |
|---|---|
| Gamer | Site nav + a **context switcher** |
| Server manager | Same switcher. Selecting a server **changes the homepage to that server's portal**, with the server's image large in the hero |
| Brand | **No site nav.** A SaaS dashboard with a side nav |
| Brand browsing the public site | Guest nav + a **"Back to dashboard"** button |

The switcher lists: *Playing as \<name\>* · each server they manage · *Add Cluster
to \<server\>* for servers they admin without the bot. **Never a brand.**

---

## 11 · Help, everywhere

| # | Rule |
|---|---|
| H1 | An **`i` icon on everything** in both portals. Clicking opens an overlay explaining what it is and the rule behind it, visually |
| H2 | A docs and guides section **inside** each portal — not a link to the marketing site |
| H5 | A **Messages** page in both portals, and **two matching inboxes** in admin — one for server owners, one for brands. Kept apart, never merged |
| H6 | **Refresh in place on all four surfaces.** The owner and the brand refresh for admin's replies; admin refreshes for theirs |
| H7 | An unanswered message **keeps alerting admin** until somebody replies. Support is the point of the page, so silence is the failure mode it exists to prevent |
| H3 | Progress bars on every gated thing: onboarding, server profile, pool eligibility, challenge lifecycle |
| H4 | **Never** a progress bar on raw member count — that advertises the wrong number to optimise |
