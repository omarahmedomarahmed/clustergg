# Operations

The console is **Admin → Command centre**. It is organised as *systems*, and a
department owns one. Everything below is a thing a person does.

## The systems

| System | Owns | The one number |
|---|---|---|
| **Bot** | Installs, server health, the messages inbox | Servers that removed the bot. Find out why, same day. |
| **Ad** | Creatives, placements, what runs where | A paid placement running house art is money taken for nothing. |
| **Brand** | The brand relationship and their portal | Unread messages from a brand. |
| **Billing** | What was launched, what was invoiced | A campaign live with no bill. |
| **Competition** | Challenges, leaderboards, challenge requests | Requests waiting on a decision. |
| **Trophies** | Prizes and payouts | A winner who hasn't been paid. |

Staff see only their department's pages. `/admin/users` and
`/admin/linked-accounts` are closed to all staff regardless of department.

## Daily

1. **Server messages.** Answer every owner the same day. An owner who waits
   three days stops recommending us.
2. **Challenge requests.** Approve, reject with a reason, or ask. A request sat
   on is a server owner who thinks nothing happens here.
3. **Brand inbox.** Same rule. Both inboxes reload in place — press Refresh
   rather than reloading the page.

## Running a challenge

**Admin → Challenges → new.** Pick the game, the window and the cadence; a
weekly cadence creates the whole month up front.

The rules section asks **who can enter** in the game's own words: a ranked
metric offers the ladder its API returns (Iron … Challenger), not a number, and
the builder shows the exact sentence a gamer will read. Most challenges should
have none — an open challenge is one more person entering.

Launching announces it to every server. **Private** challenges are announced
only inside the servers that own them, and that is the only place the entry key
is ever delivered.

**Reminders** go out daily for everything running. To push one now:
Admin → Discord → Broadcast → *Remind a challenge* — one or all, everywhere or
to chosen servers.

## Ads

A brand uploads their own creative from their portal and is live; nobody has to
approve anything for the Discord card. What staff do:

- Check every campaign has a creative for **each placement it bought**.
- Reject creatives that break size or content rules — a wrong-sized creative is
  a broken page in front of thousands of gamers.
- Escalate anything legally risky, political, or naming a competitor.

Never delete a creative to change it. The brand can **edit it in place** from
their portal, which keeps its impressions; deleting takes the numbers with it.

## Bot directories

Discord has no app store — the bot lists are the discovery layer, and every one
of them ranks by **votes**. Every card carries a *Vote for Cluster · earn CP*
button pointing at `/vote`, which lists only the directories marked Live.

Getting listed is submission work, not code. **Admin → Discord → Bot lists** has
a row per directory with its submit link, where its token appears once approved,
and per-list steps. In order: Top.gg first (largest by a distance and the only
paid auction), then Discord Bot List, discord.bots.gg, BotList.me, and BotBlock
last — BotBlock has no listing of its own, it just forwards the keys you already
hold.

Before submitting anywhere: the bot must be **online** and **Public Bot ON**.
Reviewers install it and try it; an offline bot is declined and re-submitting
goes to the back of the queue.

## When something is wrong

| Symptom | Where to look |
|---|---|
| A command doesn't respond | Vercel runtime logs. Anything that throws before the ACK is a dead bot. |
| Guides posted but not pinned | The invite is missing Manage Messages. Re-invite. |
| A brand's numbers dropped | They should not be able to. Check nothing deleted an `ad_campaign_creatives` row. |
| Standings look stale | Admin → Command centre → run the sync job and read what it reports. |
| A server got no announcement | The bot can't post in their channel, or announcements are off for that server. |
