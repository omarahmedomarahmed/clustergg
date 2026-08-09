"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sendVerificationCode, checkVerificationCode } from "@/lib/email-verify";
import { sendEmail } from "@/lib/email";
import { emailConfigured } from "@/lib/email";
import { parseBand } from "@/lib/age";

// Everything the onboarding page can do. B93.
//
// Three actions, one per step, and every one of them is written so the worst
// case is a refusal a person can read. Nothing here is allowed to leave an
// account half-changed: the email is only replaced when a code proves the new
// inbox, and the profile writes both answers or neither.

export type OnboardState = {
  ok?: true;
  error?: string;
  message?: string;
  /** Where a code was just sent, so the page can say "check this inbox". */
  sentTo?: string;
  /** DEMO ONLY. See the comment where it is set. */
  demoCode?: string;
};

export async function requestEmailCode(
  _prev: OnboardState | undefined, fd: FormData,
): Promise<OnboardState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Sign in first." };

  const db = await getDb();
  const res = await sendVerificationCode(db, me.id, String(fd.get("email") ?? "") || null);
  if (!res.ok) return { error: res.error };
  if (res.alreadyVerified) return { ok: true, message: "That inbox is already confirmed." };

  const sent = await sendEmail({
    to: res.email,
    template: "verify.code",
    data: { name: me.displayName, code: res.code!, minutes: 20 },
    ref: { type: "user", id: me.id },
  });

  revalidatePath("/onboarding");

  // WITH NO MAIL PROVIDER, THE CODE IS SHOWN ON SCREEN.
  //
  // Not a shortcut: it is the difference between a local copy of this product
  // being usable and being a dead end at step two. It is returned only when the
  // provider is genuinely not configured — on a deployment that can send, this
  // is undefined and the only place the code exists is the inbox.
  return {
    ok: true,
    sentTo: res.email,
    demoCode: emailConfigured() ? undefined : res.code,
    message: sent.ok
      ? `Code sent to ${res.email}. It works for 20 minutes.`
      : emailConfigured()
        ? "We could not send that email. Try again, or write to us."
        : `Mail is not switched on for this deployment, so here is the code instead.`,
  };
}

export async function confirmEmailCode(
  _prev: OnboardState | undefined, fd: FormData,
): Promise<OnboardState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Sign in first." };

  const db = await getDb();
  const res = await checkVerificationCode(db, me.id, String(fd.get("code") ?? ""));
  if (!res.ok) return { error: res.error };

  revalidatePath("/onboarding");
  revalidatePath("/", "layout");
  return { ok: true, message: "Confirmed. Your earning is on." };
}

/**
 * The two answers, written together.
 *
 * BOTH OR NEITHER. A country with no age band cannot be paid and an age band
 * with no country cannot be paid either, so writing one and failing on the
 * other would leave somebody looking at a finished-looking step that does not
 * count.
 */
export async function saveProfileAnswers(
  _prev: OnboardState | undefined, fd: FormData,
): Promise<OnboardState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Sign in first." };

  const band = parseBand(String(fd.get("ageBand") ?? ""));
  const country = String(fd.get("country") ?? "").trim().toUpperCase();

  if (!band) return { error: "Pick whether you are over 18 — it decides whether prize money can reach you." };
  if (!/^[A-Z]{2}$/.test(country)) return { error: "Pick your country." };

  try {
    const db = await getDb();
    await db.update(schema.users)
      .set({ ageBand: band, country })
      .where(eq(schema.users.id, me.id));
    revalidatePath("/onboarding");
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch {
    return { error: "Could not save that just now. Try again in a moment." };
  }
}
