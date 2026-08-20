# Delivery — email and DM

The thirteenth omission of the same shape, and the most expensive one. The other
documents specify **what a message says** and never **that anybody sends it**.

So the code mints a verification code and returns it to its caller. Nothing
delivers it. `dmUser` is written, correct, and called by nothing. The result is
a platform where **a gamer cannot redeem a trophy**, because redemption needs a
verified email, verification needs a code, and the code never arrives.

Neither guard could see it. `94-surface-reach` asks whether a **module** has a
caller; `lib/discord/rest.ts` has one, so `dmUser` inside it was never
questioned. `lib/identity/verify.ts` has callers too, so nothing noticed that
what it returns goes nowhere.

---

## 1 · Email

| # | Rule |
|---|---|
| L1 | **There is one send function and every email goes through it.** Two senders is how one of them quietly stops working |
| L2 | It reads `RESEND_API_KEY`. With the key **absent it does not throw** — it records the message as undelivered and says so on `/admin/preflight`. A missing key is a misconfiguration, not an outage |
| L3 | **Every send is recorded**: to whom, which kind, when, and whether it left. An operator asked *"did they get the code?"* needs an answer that is not a guess |
| L4 | A **failed send is a recorded state a human can see**, never an exception swallowed on a background path — house rule 11 applied to delivery |
| L5 | **Nothing that moves money waits on an email.** A payout, a trophy, a placement is never blocked by a send failing. The email is the notice, not the mechanism |

### What must be sent

| Kind | Trigger | Without it |
|---|---|---|
| **Verification code** | A gamer starts email verification at `/redeem`, or signs up by email | **Redemption is impossible.** The money path is broken |
| **Brand invite** | Admin creates a brand | The brand can never sign in. B1's one-time key never reaches anybody |
| **Password reset** | Gamer or brand asks | An account with a lost password is lost |
| **Weekly owner earnings** | Week close, **only once they have signed in** | Discord never gives us a guild owner's address, so this is impossible before that |
| **Redemption progress** | Approved · sent · paid | Somebody is waiting on money and hears nothing |

---

## 2 · Discord DM

The guild owner's **only** channel before they sign in. `12-IDENTITY` §6 names
four moments and not one of them fires.

| # | Rule |
|---|---|
| L6 | **On install, DM the guild owner** — whoever installed it. *Cluster is on your server, admins can create challenges from your earnings, only you can approve them* |
| L7 | **At every week close, DM the owner their earnings.** Once they have signed in, email as well |
| L8 | **On an ownership transfer, DM the outgoing owner.** The 14-day timeout (T3) starts from a message that was actually sent |
| L9 | **Before a 4-week reassignment, DM them.** Reassigning somebody who was never told is indistinguishable from taking their money |
| L10 | **A DM can fail.** An owner who blocks DMs from server members never receives it and Discord says so quietly. A failed DM is a **recorded state the guild registry shows**, with when it was tried — never a swallowed error |
| L11 | DMs are sent **through the post queue**, never inline. A per-guild loop inside a request is in `10-SETUP` §8's outage table already |

---

## 3 · The guard that would have caught this

| # | Rule |
|---|---|
| L12 | **An exported function with no caller outside its own module is an unfinished feature, and it fails the band.** Module-level reachability is not enough: `rest.ts` was reached, so `dmUser` was never questioned; `verify.ts` was reached, so nothing noticed its return value went nowhere |
| L13 | The allowance is the same self-expiring shape as `NOT_YET_RENDERED`: an entry fails both when it **gains** a caller and when it **loses** its function. A test is not a caller |
| L14 | A function whose **return value is discarded at every call site** is the same defect wearing a caller. `beginEmailVerification` returned the code to somebody who threw it away |
