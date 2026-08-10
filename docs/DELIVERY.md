# What Cluster counts as a delivered view

**This is current and it governs every delivery figure a brand is shown.**

It survived the move out of the old plan folder because the commitment in it is
the product's, not a former product's: we report what happened and we do not
model, estimate or multiply it. The Discord card is house-only now (nobody buys
that slot), so what this document governs is the WEB placements and the
challenge delivery report — but the rule is unchanged and the refusals below
are the reason a brand can believe the number.


---

## The definition

> **One card carrying a creative, rendered and delivered, is one view.**

That is the whole rule. Public or private, Discord or web, the same.

A "card" is an image Cluster renders — a gamer's profile, a challenge, a
leaderboard, a planet, a market listing — and delivers into a place a person
asked for it. When that card carries a brand's creative, the delivery is one
row in `ad_impressions`. A count is `count(*)` over those rows.

---

## What we deliberately do NOT do

**We do not multiply a public post by an audience estimate.**

A card posted into a Discord server of 4,000 members could be described as 4,000
impressions. Every ad network in the world would describe it that way. We do
not, for one reason: we cannot see how many of those 4,000 opened the channel,
and a number we cannot see is a number we would be inventing. One post is one
row.

This makes our numbers smaller than a competitor's on identical delivery. That
is the trade, and it is deliberate.

**We do not weight, model, or estimate.** There is no `views` column, no
`estimated` flag and no multiplier anywhere in the schema. One row is one view.
There is nothing to weight, so there is nothing to get wrong — and nothing an
agency has to take on trust.

---

## What this is NOT

**This is not an IAB viewable impression**, and we never claim it is.

The IAB standard requires 50% of pixels in view for at least one continuous
second. Measuring that requires a viewability SDK running in the surface where
the creative appears. Inside a Discord message we have no such surface, and no
third party has one either.

So: an IAB viewable impression is a stronger claim than ours, measured by
instrumentation we do not have. Anybody comparing a Cluster view to a viewable
impression is comparing two different things, and should say so.

## What we cannot see

Stated plainly, because a limitation you find yourself reads as a limitation we
hid:

| We cannot tell you | Why |
|---|---|
| Whether anybody scrolled past the card | Discord gives no read receipt on a message |
| How long it was on screen | No viewability instrumentation exists in that surface |
| How many members of a server saw a public post | We can count the post, not the eyes |
| Anything at all about a specific person | Reports are aggregate only — see below |

What we CAN tell you, and do: how many cards carried your creative, which kinds
of card, which servers, and — for gamers who linked accounts — what games that
audience plays, in aggregate.

---

## Deduplication

One viewer, one creative, one hour is one view.

Enforced by a unique index in the database rather than a check in code, because
two simultaneous requests would both pass a check and both insert. It closes
two real problems: an unauthenticated flood padding a count, and a rotating web
slot logging a fresh row every five seconds — which turned one idle browser tab
into twelve views a minute.

---

## Privacy bound

**Aggregate only, minimum cohort 25.**

No percentage is shown for any breakdown with fewer than 25 viewers behind it,
so nobody can re-identify a person from a small server's numbers. No brand, no
server owner and no member of Cluster staff reaches a gamer's identity through
an advertising report. This is not a setting.

---

## The rule this document creates

**No brand-facing figure may be computed from anything other than logged rows.**

Not a projection, not a member count, not a rate card multiplied by anything.
Enforced by a test — `tests/db/ad-views.mts` — rather than by discipline,
because the previous version of this platform reported a "media value" derived
from server headcount, and discipline is what failed.

*Last updated with B81.*
