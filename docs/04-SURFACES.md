# Every surface, and what lives on it

Four audiences, four surfaces, one cycle. Every page here exists to serve
`docs/01-CYCLE.md`; if a screen cannot say which phase it serves, it should not
be built.

**One rule before the lists:** every page on the website that a gamer or a server
owner needs has a **matching card in the Discord bot**. For most gamers the bot
*is* the platform. The web is where you go to look at something properly.

---

## 1 · The gamer

### Pages

| Route | What it is | Cycle phase |
|---|---|---|
| `/` | Homepage — live challenges, countdown, the pool | All |
| `/challenges` | Every challenge: this week, next week, past | Prepare · Run |
| `/challenges/[id]` | One challenge — prize, trophies, rules, standings, join | Run |
| `/games` · `/games/[slug]` | A game, and every challenge on it | Prepare |
| `/trophies` | The showcase — every trophy, its value, its holders | All |
| `/trophies/[id]` | One trophy — brand, challenge, series, holders, past holders | All |
| `/community` | Community challenges run by servers | Grace |
| `/servers` · `/servers/[slug]` | A server's public page — **big Join button**, their community challenges | All |
| `/pool` | This week's pool, live, every server and its earnings | Run |
| `/u/[slug]` | A gamer's public profile — trophies, challenges, rank history | All |
| `/onboarding` | Link an account · age band · country | Prepare |
| `/redeem` | 18+ only: verify email, choose method, request payout | Close |
| `/profile` | Their own dashboard — challenges entered, trophies, standings | Run |
| `/settings/*` | Account, connections, privacy, notifications | — |
| `/signup` · `/login` | **Sign in with Discord, or sign up with email + password.** Either. One `users` row either way | — |
| `/reset` | Password reset — gamers and brands | — |
| `/login/brand` | Brands only. Email + password, separate table | — |
| `/rules/[who]` | Published rules for gamer, owner, brand | — |
| `/legal/*` | Terms, privacy, cookies | — |

### The homepage — the most important page on the platform

| Block | During the week | During the grace period |
|---|---|---|
| **Hero** | Live challenges + a **big countdown to Friday 00:00 UTC** | *Week ended* · winners · next week's challenges |
| **The pool** | **Live, and as prominent as the challenges.** Every server, its three KPIs, and **the actual dollars it has earned so far this week.** Updates in place without a page reload | Final standings, marked paid |
| **Community** | Not at the top | **Promoted** |
| **Always** | The three KPIs stated plainly, and a bold line saying we reward outcomes and never Discord activity | Same |

The pool being public is the whole idea. We do not buy entrants with
advertising — we make what each community earns visible, and the communities
bring their members.

### Onboarding — one page, two paths, no email

The first full screen asks **"Are you a gamer, or a server owner?"** — visual,
with real screenshots, and skippable. Full rules in `docs/12-IDENTITY.md` §2.

| Step | Gamer path | Server-owner path |
|---|---|---|
| 1 | The fork | The fork |
| 2 | Age band | Age band |
| 3 | Country | Country |
| 4 | **Link a game account** | **`guilds` scope** → pick a server they admin → add the bot |

| # | Rule |
|---|---|
| 1 | Under-13 is a link that deletes the account, never a third button |
| 2 | Sanctioned countries are **not offered at all** |
| 3 | Both paths ask age band and country. **One person, one answer**, used for their gamer profile and every server they own |
| 4 | Either path always says they can be the other one too, at any time |
| 5 | **`guilds` is requested here, never at signup** |
| 6 | A progress bar on every step |

Email is asked **only at redemption**, and verified then. Nothing accrues until
age band, country and a linked account are done.

### Nav

| Surface | Nav |
|---|---|
| Gamer | Site nav + a **context switcher** |
| Server manager | The same switcher. Selecting a server makes the homepage **that server's portal** |
| Brand | **No site nav.** A SaaS dashboard with a side nav |
| Brand on the public site | Guest nav + **Back to dashboard** |

The switcher lists *Playing as \<name\>*, each server they manage, and *Add
Cluster to \<server\>* for servers they admin without the bot. **Never a
brand.**

---

## 2 · The server owner

Access is by **Discord sign-in**, plus admin rights on that guild. There is no
portal key. Full rules in `docs/12-IDENTITY.md` §6.

| Action | Guild owner | Administrator / mapped role |
|---|---|---|
| View standings, analytics, members | ✅ | ✅ |
| Re-announce · edit the profile · add the bot | ✅ | ✅ |
| **Request** a community challenge | ✅ | ✅ |
| **Approve** a community-challenge spend | ✅ | ❌ |
| **Withdraw** | ✅ | ❌ |

### Portal pages — and every one has a matching admin bot card

| Page | What it does |
|---|---|
| Overview | Vault balance, this week's pool share, live earnings |
| **This week's challenges** | Every challenge feeding this week's pool, with a **Re-announce** button on each and a **Re-announce all** |
| Standings | Their three KPIs, their position, what would move it |
| Members | Linked members, entrants, activation rate |
| Community challenges | Build one — $5/1 winner or $10/3 winners |
| Wallet | Earnings, withdrawals, history |
| Settings | Contact, payout preference, **admin role mapping** |
| **Server profile** | Member age range · games played · bio · permanent invite · cover image · announcement channel. **Required to be scored at all** |
| **Analytics** | Empty until an *Allow analytics* button grants member-list access, then **permanent**. Their own dashboard, read-only, snapshot always dated, an **Update** button on a guild-level cooldown under a platform-wide ceiling. `12-IDENTITY.md` §7a |
| **Messages** | Talk to Cluster. **Refresh in place** |
| Help | An `i` icon on everything, plus docs and guides **inside** the portal |

### Bot installation and permissions

| # | Rule |
|---|---|
| 1 | **Capture the installer at the install redirect** — who they were and whether they were the guild owner. Discord never tells us afterwards |
| 2 | If they are not signed in at that moment, sign them in first, then redirect back with the guild still selected |
| 3 | On install, **DM the guild owner** — even if somebody else installed it |
| 4 | Access is by **ADMINISTRATOR permission** *or* a role the owner maps by hand |
| 5 | **Store the role ID, not the name.** A renamed role must not silently revoke access |
| 6 | **Only the guild owner touches money.** Administrators request; the owner approves |
| 7 | **Admin cards are never public messages.** Ever |
| 8 | The guild owner's portal **exists before they ever sign up** |
| 9 | If the bot is removed the portal survives. Errors read *"tell your admin to reinstall Cluster"*. Reinstalling resumes everything |

---

## 3 · The brand

Fully self-serve from signup.

### Journey

| Step | Where | What |
|---|---|---|
| 1 | `/brands` | Sign up. Portal created, **a one-time invite key emailed** |
| 2 | `/login/brand` | Redeem the key **once**, then set an email + password. Every sign-in after that is email + password |
| 3 | Portal setup | Contact name, phone, logo |
| 4 | **Builder step 1** | Big game cards with logo and cover art. Pick one or several |
| 5 | **Builder step 2** | Per game: how many challenges · single or series · which week |
| 6 | **Builder step 3** | Start date, announce date, expected reach, price — all before paying |
| 7 | Checkout | Confirm & Pay. Bill created |
| 8 | Portal | Watch it fill |
| 9 | Portal | Read results |

### Portal pages

| Page | What it shows |
|---|---|
| Overview | Live challenges, entrants, reach |
| **Messages** | Talk to Cluster. **Refresh in place** |
| Builder | The purchase flow above |
| Challenges | Every challenge, per week of a series |
| **Trophies** | Their branded trophies, **how many gamers hold each**, and who |
| Reports | Entrants and reach per challenge, filtered by game and by week |
| Billing | Invoices, paid and outstanding |

### Reach and entrants — counted, never modelled

| Term | Definition |
|---|---|
| **Reach** | Every member of every server a challenge was announced to |
| **Entrants** | Gamers who joined **that** challenge |
| **Double counting** | **Deliberate.** The same 10 members across two challenges is 2 × 10 reach. The same gamer entering week 1 and week 2 is 2 entrants |
| **Never** | Sum reach or entrants across challenges into a "unique audience" figure |

### What a brand cannot do

| | Why |
|---|---|
| Pick an arbitrary date | Start is always the start of a week |
| Build a daily challenge | Admin-built only |
| Set a custom prize pool | $350 buys a fixed split |
| See another brand's numbers | Which is exactly why nobody sees theirs |
| Slice an audience by age band | It is a compliance field, not a targeting field |
| See any group smaller than 25 people | A count of three is three people somebody can name |

---

## 4 · The Discord bot

HTTP interactions only. No gateway.

| Constraint | |
|---|---|
| **Acknowledge within 3 seconds** | Discord kills a slower interaction. Work happens after the acknowledgement |
| **`custom_id` ≤ 100 characters** | The nav grammar packs screen, arguments and a back-trail into that budget |
| **Every reply is a card** | Rendered image, consistent, branded |
| **A decoration may never take a card down** | Anything that can throw on a card path is fenced |
| **Ed25519 verification** on every request | |

### Card families

| Family | Cards |
|---|---|
| Home | home · help · commands · search |
| Challenges | this week · one challenge · join · standings · my entries |
| Games | game list · one game · link account · prove ownership |
| Profile | my profile · another gamer · my trophies |
| Trophies | showcase · one trophy · holders |
| Server | server overview · pool standing · this week's challenges |
| **Admin (owner-only)** | **every owner-portal page, as a card. Never public** |
| Community | community challenges · build one |

### The three announcements

| When | What | Where |
|---|---|---|
| On admin's click | A challenge is announced | Every server, or one if community |
| **Friday** | **Winners, once.** The card names each winner's server | Every server |
| **Saturday** | **Pool standings, once** | Every server |

Once each. A bot that repeats itself gets muted, and a muted bot is a dead
distribution channel.

---

## 5 · The public API

| Route | Purpose |
|---|---|
| `/api/discord/interactions` | The bot. Ed25519-verified |
| `/api/cron/sync` | Hourly stat pull |
| `/api/cron/daily` | Gun stamping, close, milestones |
| `/api/cron/announce` | Post-queue drain, every 5 minutes |
| `/api/payments/webhook` | Marks a bill paid → triggers vault routing |
| `/api/auth/discord` · `/api/auth/discord/callback` | Discord OAuth — identity, and guild roles when asked |
| `/api/auth/discord/install` | The bot install redirect. **Captures the installer** |
| `/api/auth/brand` | Brand email + password, and the one-time invite exchange |
| `/api/challenges/[id]/leaderboard` | Live standings |
| `/api/pool` | Live pool standings, for the homepage's in-place refresh |
| `/api/auth/[provider]` | Ownership proof via OAuth/OpenID |

| # | Rule |
|---|---|
| A1 | A cron job **computes**; it never releases money |
| A2 | The webhook is the **only** thing that moves a challenge to `scheduled` |
| A3 | Nothing fans out per-guild inline from a request. Announcements are queued and drained |

---

## 6 · Admin

Covered in full in `docs/05-ADMIN.md`. The one rule that belongs here:

**`/admin/users` and `/admin/linked-accounts` are admin-only.** No staff
department reaches the gamer directory or the linked-account list, ever.

---

## 7 · Content and copy

| # | Rule |
|---|---|
| C1 | **Every figure on every page is imported from the module that enforces it.** No page retypes a price, a share, a threshold or a floor |
| C2 | A document that quotes a rate is a rate we are held to by whoever read it |
| C3 | All editable copy lives in one content store with a default for every key |
| C4 | A default must never state a number the product decides — it asks for it |
| C5 | Never claim an account or a player is "verified" unless ownership was actually proven |
| C6 | Never describe an audience group smaller than 25 people |
