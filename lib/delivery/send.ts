// The one send function. Every message the platform owes anybody goes through it.
//
// ===== THE LAUNCH BLOCKER, AND WHY IT WAS INVISIBLE =====
//
// `beginEmailVerification` minted a six-digit code and **returned it**. Both
// call sites handed it to `isDemoMode ? { code } : {}`. So in production the
// code existed for the length of one function call and was never sent
// anywhere, the page said *"sent"*, and `users.emailVerifiedAt` could never be
// written — which means `checkEligibility` refused every money trophy on the
// platform with `email_unverified`. The money path was broken end to end and
// every band was green.
//
// `beginReset` had the identical shape. So did the brand invite: there was
// nowhere for B1's one-time key to go.
//
// ===== L1 — ONE SENDER, AND THE REASON IT IS A RULE =====
//
// *"Two senders is how one of them quietly stops working."* Every kind below
// is a case in one function rather than a function each, so there is exactly
// one place that reads the key, one place that records the attempt, and one
// place that can be broken to prove the negative half.
//
// ===== L2 — A MISSING KEY IS A MISCONFIGURATION, NOT AN OUTAGE =====
//
// With no `RESEND_API_KEY` this records the message as **undelivered** and
// returns. It does not throw. `/admin/preflight` already had the row saying
// the key is missing; what it lacked was the list of people who were owed
// something while it was.
//
// `undelivered` and `failed` are deliberately not the same word. Undelivered
// means we never tried. Failed means Resend refused, and `error` says why.
//
// ===== L5 — NOTHING THAT MOVES MONEY WAITS ON THIS =====
//
// This function **cannot throw**. Not "should not" — the whole body is inside
// a try, and the catch records a failed row and returns. That is what makes
// the wiring rule enforceable at every call site: a payout, a trophy and a
// placement are already committed before anything here runs, and nothing here
// can unwind them. The negative half of the guard is exactly this: break the
// sender, and the money still moves.
//
// House rule 5 lives here too, one level up from the schema: **no body is ever
// stored.** A verification code, a reset token and a brand's one-time key all
// travel through this function, and a table holding every secret we ever sent
// would be worth more to somebody than the accounts it opens.

import { uid } from "../core/utils.ts";
import { getDb, schema } from "../db/index.ts";

/** Every message the platform owes somebody. `15-DELIVERY` §1's table. */
export const EMAIL_KINDS = [
  "verification",
  "brand_invite",
  "password_reset",
  "owner_earnings",
  "redemption_progress",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export type SendResult = {
  status: "sent" | "failed" | "undelivered";
  /** Why it did not leave. Null when it did. */
  error: string | null;
};

export type Email = {
  to: string;
  kind: EmailKind;
  subject: string;
  /** Plain text. Every message this platform sends is readable without HTML. */
  body: string;
  /** Ours, when we have one. A brand invite goes to somebody with no account. */
  userId?: string | null;
  guildId?: string | null;
};

/**
 * Overridable so the band can drive every call site without a network, and
 * so the negative half can break the transport and watch the money still move.
 *
 * Defaulted to the real thing rather than injected everywhere: a dependency
 * with no real default is a dependency that is only ever tested as a stub, and
 * this is the one whose production path was the defect.
 */
export type Transport = (email: Email, apiKey: string) => Promise<SendResult>;

const FROM = process.env.EMAIL_FROM || "Cluster <no-reply@cluster.gg>";

const resendTransport: Transport = async (email, apiKey) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email.to],
      subject: email.subject,
      text: email.body,
    }),
  });
  if (res.ok) return { status: "sent", error: null };
  const detail = await res.text().catch(() => "");
  return { status: "failed", error: `${res.status} ${detail.slice(0, 300)}` };
};

/**
 * The transport slot.
 *
 * ===== WHY A RECORD AND NOT A `setEmailTransport()` =====
 *
 * L12 — *an exported function with no caller outside its own module is an
 * unfinished feature* — and a setter that only the band ever calls is exactly
 * that shape, however good the reason. Writing one and then excusing it is the
 * softening the rule exists to prevent.
 *
 * So the seam is **data**: one field, whose default is the production path, so
 * every real send exercises it. The band assigns to it to prove the negative
 * half of L5 — break the sender and the money still moves — which is the one
 * property that cannot be checked without being able to break delivery.
 */
export const TRANSPORT: { email: Transport } = { email: resendTransport };

/**
 * Send one email, record the attempt, and never throw.
 *
 * The record is written **after** the attempt rather than before, in one row:
 * a pending row that a crash left behind would read as "we are still trying"
 * forever, and there is no retry loop here for it to be true of. What an
 * operator needs is the answer, and the answer is known by the time this
 * writes.
 */
export async function sendEmail(email: Email): Promise<SendResult> {
  let result: SendResult;
  try {
    const apiKey = process.env.RESEND_API_KEY;
    result = apiKey
      ? await TRANSPORT.email(email, apiKey)
      : {
          status: "undelivered",
          error: "RESEND_API_KEY is not set, so nothing was sent. Set it and ask them to try again.",
        };
  } catch (e) {
    result = { status: "failed", error: (e as Error).message.slice(0, 300) };
  }

  await record({
    channel: "email",
    kind: email.kind,
    recipient: email.to,
    userId: email.userId ?? null,
    guildId: email.guildId ?? null,
    subject: email.subject,
    status: result.status,
    error: result.error,
  });

  return result;
}

/**
 * Write the row. Fenced for the same reason everything else here is.
 *
 * L4 wants a failed send to be a state a human can see. What it must never be
 * is a state that takes down the thing it is a note about — a database blip
 * while recording that an email failed cannot be allowed to throw into a
 * redemption that has already been approved.
 */
export async function record(row: {
  channel: "email" | "dm";
  kind: string;
  recipient: string;
  userId?: string | null;
  guildId?: string | null;
  subject?: string | null;
  status: "sent" | "failed" | "undelivered";
  error?: string | null;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.deliveries).values({
      id: uid(),
      channel: row.channel,
      kind: row.kind,
      recipient: row.recipient,
      userId: row.userId ?? null,
      guildId: row.guildId ?? null,
      subject: row.subject ?? null,
      status: row.status,
      error: row.error ?? null,
    });
  } catch (e) {
    console.error("[delivery] could not record an attempt", e);
  }
}
