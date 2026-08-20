// Who to tell, and how to find their address.
//
// ===== WHY THIS IS A SEPARATE MODULE FROM THE MONEY =====
//
// L5 — *"nothing that moves money waits on an email. A payout, a trophy, a
// placement is never blocked by a send failing. The email is the notice, not
// the mechanism."*
//
// That rule decides a shape, not just a discipline. The obvious way to write
// "email them when their redemption is approved" is a line inside
// `approveRedemption`, and it is wrong twice over: inside the transaction it
// makes an HTTP call to Resend part of the money commit, so a Resend timeout
// rolls back an approval that already happened; and awaited on the caller's
// path it turns a succeeded operation into a visible failure.
//
// So the notices live **here**, downstream, in a module the money modules do
// not import. `lib/trophies/redemption.ts` has no idea this file exists, which
// is what makes the negative half of the guard writable: break the sender, and
// the payout, the trophy and the placement all still happen.
//
// Every function here is fenced and returns rather than throwing, for the same
// reason. House rule 11, applied to delivery: a notice is a decoration on a
// money event, and a decoration may never take the event down.

import { and, eq, isNotNull } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { sendOwnerEarnings, sendRedemptionProgress, type RedemptionStage } from "./emails.ts";
import { record } from "./send.ts";

/**
 * Tell a gamer where their redemption has got to.
 *
 * Called **after** the state has been written, never inside the transaction
 * that writes it. Returns quietly when there is nothing to send to: a Discord
 * gamer always has a verified address by the time a redemption exists (R1),
 * but "always" is a rule enforced somewhere else, and reading it as a promise
 * here would make this the second place that believes it.
 */
export async function notifyRedemptionProgress(
  db: DB,
  redemptionId: string,
  stage: RedemptionStage,
): Promise<void> {
  try {
    const [row] = await db
      .select({
        userId: schema.redemptions.userId,
        amountCents: schema.redemptions.amountCents,
        email: schema.users.email,
      })
      .from(schema.redemptions)
      .innerJoin(schema.users, eq(schema.redemptions.userId, schema.users.id))
      .where(eq(schema.redemptions.id, redemptionId));

    if (!row?.email) {
      // L4 — a message we could not send is a state a human can see, and "we
      // had no address" is as much a reason as a provider refusing.
      await record({
        channel: "email",
        kind: "redemption_progress",
        recipient: "(none)",
        userId: row?.userId ?? null,
        subject: `Redemption ${stage}`,
        status: "failed",
        error: "No email address on the account, so nothing could be sent.",
      });
      return;
    }

    await sendRedemptionProgress({
      to: row.email,
      userId: row.userId,
      stage,
      amountCents: row.amountCents,
    });
  } catch (e) {
    console.error("[delivery] redemption notice failed", e);
  }
}

/**
 * The weekly earnings email, to owners who have signed in.
 *
 * ===== "ONLY AFTER THEY HAVE SIGNED IN" IS NOT A PREFERENCE =====
 *
 * `15-DELIVERY` §1: *Discord never gives us a guild owner's address, so this
 * is impossible before that.* The condition is therefore structural — there is
 * no address to send to — and it is expressed as a join rather than a flag: an
 * owner has an email when their Discord id matches a `users` row that has one.
 * `ownerFirstSignInAt` is the same fact recorded, and both are required, so a
 * row that somehow has one without the other sends nothing.
 *
 * The DM is the other half and does not depend on any of this — L7 sends it at
 * every close, signed in or not.
 */
export async function notifyOwnerEarnings(
  db: DB,
  input: { guildId: string; weekStart: Date; amountCents: number },
): Promise<void> {
  try {
    const [row] = await db
      .select({
        name: schema.guilds.name,
        userId: schema.users.id,
        email: schema.users.email,
      })
      .from(schema.guilds)
      .innerJoin(schema.users, eq(schema.guilds.ownerDiscordId, schema.users.discordId))
      .where(
        and(
          eq(schema.guilds.guildId, input.guildId),
          isNotNull(schema.guilds.ownerFirstSignInAt),
          isNotNull(schema.users.email),
        ),
      );

    // No row is the ordinary case, not a failure: most owners have never
    // signed in, and the DM is how they are told. Recording an "undelivered"
    // here would fill the operator's list with people nothing was owed to.
    if (!row?.email) return;

    await sendOwnerEarnings({
      to: row.email,
      userId: row.userId,
      guildId: input.guildId,
      serverName: row.name,
      weekStart: input.weekStart,
      amountCents: input.amountCents,
    });
  } catch (e) {
    console.error("[delivery] owner earnings notice failed", e);
  }
}
