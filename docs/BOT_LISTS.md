# Getting Cluster onto the Discord bot lists

Step by step, in the order to do them. Everything here is an **operational** task —
each list approves the bot on its own terms and only then issues a token — so the
code is already waiting. Your part is the submissions.

**Where you do the Cluster half of every step:** Admin → Discord → *Bot lists*.

---

## Before you start — do this once

Nothing below will pass review without these.

1. **The bot must be ONLINE.** Reviewers install it and try it. A bot that
   doesn't respond is declined, and re-submitting puts you at the back of the
   queue. Check `/cluster` answers in a test server first.
2. **The bot must be PUBLIC.** Discord Developer Portal → your application →
   Bot → **Public Bot: ON**. It is off during development and a private bot
   cannot be added by a reviewer.
3. **Have these to hand:**
   - **Application ID** — Developer Portal → General Information.
   - **Invite link** — the "Add ClusterBot" URL from `/discord-bot`.
   - **Support server invite** — most lists ask for one and some require it.
   - **A description.** Write it once, reuse it everywhere. Lead with what a
     server GETS, not with what the bot is: *"Weekly competitions your members
     enter with one tap, scored from the game's own API. Cluster funds the prize
     pools."*
   - **Screenshots** — two or three rendered cards. Every list ranks a listing
     with images above one without.

---

## 1. Top.gg — do this one first

The largest by a distance, and the only one with a paid advertising auction.
Being here matters more than the other three combined.

1. Sign in at **https://top.gg** with Discord.
2. Go to **https://top.gg/bot/new**.
3. Paste your **Application ID** → **Find Bot**.
4. Fill in: short description, long description (markdown), tags, invite link,
   support server, website (`https://clustergg.com`), and the prefix — Cluster is
   slash-commands only, so state `/`.
5. Tick the box confirming **the bot will be online during review**.
6. Submit. You are now in the review queue. You'll get an email, and a Discord
   ping if you're in their server.
7. **Once approved:** your project page → **Integrations & API** → copy the
   token. ⚠️ This is a top.gg token, **not** your Discord bot token.
8. In Cluster: Admin → Discord → Bot lists → **Top.gg** →
   - paste the token into **API token**
   - set **Where we stand** to **Live**
   - invent a long random string, paste it into **Webhook secret**
   - copy the **Vote webhook URL** shown there
   - press **Save**
9. Back on top.gg: **Webhooks** → paste that URL into the webhook field, and the
   **same secret string** into the Authorization field.
10. Press **Post now** in Cluster to push the server count immediately.

**Result:** votes on top.gg now pay Cluster Points, and the listing shows a live
server count.

---

## 2. Discord Bot List (discordbotlist.com)

Second by traffic. Also sends vote webhooks, so voting pays here too.

1. Sign in at **https://discordbotlist.com** with Discord.
2. **https://discordbotlist.com/bots/new** → paste the Application ID.
3. Fill in description, tags, invite link, support server. Upload screenshots.
4. Submit for review.
5. **Once approved:** your bot's page → **Edit** → copy the **API token**.
6. In Cluster: Bot lists → **Discord Bot List** → paste the token, set **Live**,
   set a webhook secret, copy the webhook URL, **Save**.
7. Back on the list: paste the webhook URL and the same secret into its webhook
   settings.

⚠️ This list expects the token sent as `Bot <token>` — Cluster already does that,
so paste the token **bare**, without the word `Bot` in front.

---

## 3. discord.bots.gg

No voting, but very well indexed by search engines — a lot of its value is people
finding the listing from Google rather than from the site.

1. Sign in at **https://discord.bots.gg**.
2. **https://discord.bots.gg/bots/add** → Application ID, description, invite,
   support server.
3. Submit. Their review is stricter about the description actually explaining
   what the bot does — no marketing-only copy.
4. **Once approved:** token at **https://discord.bots.gg/docs** while signed in.
5. In Cluster: paste it, set **Live**, **Save**. No webhook — this list has no
   voting.

---

## 4. BotList.me

Small, free, and costs one token to keep updated. Do it once the three above are
done.

1. **https://botlist.me/bots/new** → the usual fields.
2. **Once approved:** bot page → Edit → API → copy the token.
3. In Cluster: paste it, set **Live**, add a webhook secret, **Save**, then paste
   the webhook URL and secret back into the list.

---

## 5. BotBlock — last, and only after the others

BotBlock has **no listing of its own and no token**. It is a fan-out: one POST
carrying the keys you already hold, forwarded to the long tail of smaller lists.

It can only forward keys you have. Switching it on before you have any is a call
that does nothing, which is why Cluster reports it as *"Nothing to forward"*
rather than as a success.

1. In Cluster: Bot lists → **BotBlock** → set **Where we stand** to **Live**.
2. **Save**, then **Post now**.

---

## After you're listed: the part that actually grows the bot

Server count is a credibility signal. **Votes are the ranking.** Every list lets a
person vote every 12 hours, so the same people can vote twice a day forever — and
they will, if there is a reason.

Cluster's reason is Cluster Points, and it is already wired:

- **Every bot card carries a "Vote for Cluster · earn CP" button** pointing at
  `clustergg.com/vote`, which lists only the sites you have marked **Live**.
- **A signed vote pays CP** into the Signal quest, on the gamer's real profile.
- **Somebody who votes without a Cluster account gets DM'd** how to sign in so
  the next one pays. That is the highest-intent signup prompt the product has —
  they just went out of their way to help.

**Tune the reward** in Admin → Quests → Signal → *"Vote for Cluster on a bot
list"*. The daily cap is 2, which is the 12-hour cooldown rather than a number we
picked.

---

## Paid promotion on Top.gg

Top.gg runs a **CPM auction**: you bid per thousand impressions on tags, winning
bids go live the following Tuesday, for one week.

A published case study spent **$700 for roughly 560,000 impressions — about
$1.25 CPM**.

Worth doing the arithmetic before committing outbound budget: the financial model
assumes **$25 per server acquired**. At $1.25 CPM, even a 0.05% install rate puts
a server at roughly **$2.50**. Test with a few hundred dollars against the server
line before deciding the acquisition plan is outbound-shaped.

Bid on tags people browsing for what we do would actually use: `gaming`,
`leveling`, `giveaway`, `economy`, `stats`.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| **"No API key set"** on Post now | Not a failure — you haven't pasted that list's token yet. |
| **401 on Post now** | The token is wrong, or you pasted your *Discord* bot token instead of the list's. |
| **403 on Post now** | The bot isn't approved on that list yet. Posting is only allowed once listed. |
| **Vote webhook returns 503** | No webhook secret saved on our side. Set it in Bot lists first. |
| **Vote webhook returns 401** | The secret in the list's dashboard doesn't match the one saved here. |
| **A vote is `credited: false, no_cluster_account`** | The voter has never signed into Cluster with that Discord account. They get DM'd how to. Working as intended. |
| **Declined by a list** | Almost always the bot was offline during review, or set to private. Fix, then resubmit. |

Check any webhook URL by opening it in a browser — a `GET` tells you whether that
list is known and whether its secret is configured, without needing a terminal.
