"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sendVerificationCode, checkVerificationCode, codeShownOnScreen } from "@/lib/email-verify";
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
    demoCode: codeShownOnScreen(emailConfigured()) ? res.code : undefined,
    message: sent.ok
      ? `Code sent to ${res.email}. It works for 20 minutes.`
      : codeShownOnScreen(emailConfigured())
        ? "Mail is not switched on for this deployment, so here is the code instead."
        // Mail is off (or failing) on a REAL deployment. Said plainly rather
        // than left as a silent wait, and the code is never printed here.
        : "We could not send that email. Try again in a moment, or write to us and we will confirm it by hand.",
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
  const themeKey = String(fd.get("theme") ?? "").trim();
  const showAgeMark = String(fd.get("showAgeMark") ?? "1") !== "0";

  if (!band) return { error: "Pick whether you are over 18 — it decides whether prize money can reach you." };
  if (!/^[A-Z]{2}$/.test(country)) return { error: "Pick your country." };

  // The theme is the third mandatory answer (B97) and the only one that is pure
  // decoration — so an unknown key falls back to the default rather than
  // refusing the whole form. Nobody should lose two correct answers because a
  // preset was renamed between the page loading and the button being pressed.
  const { TEMPLATES, DEFAULT_THEME } = await import("@/lib/theme");
  const template = TEMPLATES.find((t) => t.key === themeKey) ?? TEMPLATES[0];

  try {
    const db = await getDb();
    // ANSWERED ONCE. B95 removed self-serve age changes — a fact somebody can
    // rewrite the day it becomes inconvenient is not a fact, and this one is
    // the only thing between a minor and a payment we may not make. The guard
    // is here as well as in `changeBand` because this action is the path
    // everybody actually takes.
    const [row] = await db.select({ band: schema.users.ageBand })
      .from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
    if (row?.band && row.band !== band) {
      const { BAND_CHANGE_HELP } = await import("@/lib/age");
      return { error: BAND_CHANGE_HELP };
    }

    await db.update(schema.users)
      .set({
        ageBand: band, ageBandSetAt: new Date(), country, showAgeMark,
        // Written WHOLE, from the defaults up, rather than as `{ template }`
        // alone: the renderer reads a full theme, and a blob carrying only a
        // key would render as the default while the picker showed something
        // else. B97.
        theme: { ...DEFAULT_THEME, ...template.theme, template: template.key },
      })
      .where(eq(schema.users.id, me.id));
    revalidatePath("/onboarding");
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch {
    return { error: "Could not save that just now. Try again in a moment." };
  }
}

/**
 * "I'm under 13" — confirmed. B95.
 *
 * The account is deleted and the identifiers are blocked. See `lib/under13.ts`
 * for why anything is kept at all and exactly what.
 *
 * A typed confirmation is required, the same as the ordinary delete path and
 * for the same reason: this is irreversible, and a button somebody can reach by
 * mis-tapping twice is not a decision.
 */
export async function confirmUnderThirteen(
  _prev: OnboardState | undefined, fd: FormData,
): Promise<OnboardState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Sign in first." };

  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm. Nothing has been deleted." };
  }

  const db = await getDb();
  const { deleteForUnderThirteen } = await import("@/lib/under13");
  const res = await deleteForUnderThirteen(db, me.id);
  if (!res.ok) return { error: res.error };

  const { destroySession } = await import("@/lib/auth");
  await destroySession();
  redirect("/goodbye");
}
