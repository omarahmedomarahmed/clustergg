// The five emails, and the words in them.
//
// `15-DELIVERY` §1 names five and says what breaks without each. Every one is
// a function that takes its figures rather than a string that carries them —
// house rule 2, and `14-EDITABLE` E1's reason stated one surface along: an
// email is copy that cannot be corrected after it is sent, so it is the worst
// possible place for a number somebody typed.
//
// Nothing here decides anything. Each function builds a subject and a body and
// hands them to the one send function, which records the attempt and cannot
// throw — L5, which is what lets these sit downstream of money that has
// already moved.

import { formatMoney } from "../money/amounts.ts";
import { siteUrl } from "../discord/config.ts";
import { sendEmail, type SendResult } from "./send.ts";

/**
 * The verification code.
 *
 * ===== WITHOUT THIS, NOBODY ON THE PLATFORM CAN BE PAID =====
 *
 * Redemption needs a verified email (`checkEligibility`'s `email_unverified`),
 * verification needs a code, and the code was minted, returned, and dropped.
 * This is the function whose absence broke the money path end to end.
 */
export function sendVerificationCode(input: {
  to: string;
  code: string;
  userId: string;
}): Promise<SendResult> {
  return sendEmail({
    to: input.to,
    kind: "verification",
    userId: input.userId,
    subject: "Your Cluster verification code",
    body: [
      `Your code is ${input.code}`,
      "",
      "It works for thirty minutes. Type it into the page that asked for it.",
      "",
      "We ask for an address once, and this is it — it is how we reach you about",
      "money you have won. If you did not ask for this, nothing has happened to",
      "your account and you can ignore it.",
    ].join("\n"),
  });
}

/**
 * The brand's one-time invite key (B1).
 *
 * It is redeemable once and exchanged for an email and a password. Hashed at
 * rest, so this is the only time it exists in readable form anywhere — which
 * is also why `deliveries` stores a subject and never a body.
 */
export function sendBrandInvite(input: {
  to: string;
  brandName: string;
  key: string;
}): Promise<SendResult> {
  return sendEmail({
    to: input.to,
    kind: "brand_invite",
    subject: `Your Cluster dashboard for ${input.brandName}`,
    body: [
      `${input.brandName} has a Cluster brand dashboard waiting.`,
      "",
      `Open ${siteUrl()}/login/brand and use this key once:`,
      "",
      `    ${input.key}`,
      "",
      "It works exactly once. Redeeming it sets the password you will use from",
      "then on, and the key stops working the moment you do.",
    ].join("\n"),
  });
}

/** The reset. An account with a lost password is lost without it. */
export function sendPasswordReset(input: {
  to: string;
  token: string;
  kind: "gamer" | "brand";
  userId?: string | null;
}): Promise<SendResult> {
  const url = `${siteUrl()}/reset?kind=${input.kind}&token=${encodeURIComponent(input.token)}`;
  return sendEmail({
    to: input.to,
    kind: "password_reset",
    userId: input.userId ?? null,
    subject: "Reset your Cluster password",
    body: [
      "Somebody asked to reset the password on this address.",
      "",
      url,
      "",
      "The link works for one hour and once only.",
      "",
      "If it was not you, nothing has changed and you do not need to do anything —",
      "a reset link on its own cannot open an account.",
    ].join("\n"),
  });
}

/**
 * The weekly earnings note, **only once they have signed in**.
 *
 * `15-DELIVERY` §1 is explicit that this is impossible before then: Discord
 * never gives us a guild owner's address, so until they arrive the DM is the
 * only channel there is. The caller is what enforces that, not this function —
 * an email builder that quietly decided who may be written to would be a
 * second opinion about a rule that lives in `12-IDENTITY`.
 */
export function sendOwnerEarnings(input: {
  to: string;
  guildId: string;
  serverName: string;
  weekStart: Date;
  amountCents: number;
  userId?: string | null;
}): Promise<SendResult> {
  const week = input.weekStart.toISOString().slice(0, 10);
  return sendEmail({
    to: input.to,
    kind: "owner_earnings",
    guildId: input.guildId,
    userId: input.userId ?? null,
    subject: `${input.serverName} earned ${formatMoney(input.amountCents)} this week`,
    body: [
      `Week of ${week}`,
      "",
      `${input.serverName} earned ${formatMoney(input.amountCents)}.`,
      "",
      `The full breakdown — every server, every figure — is public at ${siteUrl()}/pool`,
      `Your own portal is at ${siteUrl()}/portal/server/${input.guildId}`,
    ].join("\n"),
  });
}

/** The three states somebody waiting on money is owed a word about. */
export const REDEMPTION_STAGES = {
  approved: {
    subject: "Your Cluster payout is approved",
    line: "It is approved and queued to be sent.",
  },
  sent: {
    subject: "Your Cluster payout is on its way",
    line: "It has been sent to the payment provider.",
  },
  paid: {
    subject: "Your Cluster payout has been paid",
    line: "It has been paid.",
  },
} as const;
export type RedemptionStage = keyof typeof REDEMPTION_STAGES;

/**
 * Where a redemption has got to.
 *
 * ===== THE ONE THAT MUST NOT BE IN THE MONEY'S PATH =====
 *
 * L5, at its sharpest: somebody is waiting on money, and the thing they are
 * waiting on must never depend on us being able to tell them about it. Every
 * caller of this sits **after** the state has been written and does not await
 * a failure into anything.
 */
export function sendRedemptionProgress(input: {
  to: string;
  userId: string;
  stage: RedemptionStage;
  amountCents: number;
}): Promise<SendResult> {
  const stage = REDEMPTION_STAGES[input.stage];
  return sendEmail({
    to: input.to,
    kind: "redemption_progress",
    userId: input.userId,
    subject: stage.subject,
    body: [
      `Your ${formatMoney(input.amountCents)} redemption.`,
      "",
      stage.line,
      "",
      `You can see it at ${siteUrl()}/redeem`,
    ].join("\n"),
  });
}
