"use server";

// The redeem actions. 04 §1 `/redeem`, cycle phase **Close**.
//
// ===== T1/T2 — THE $0 REFUSAL LIVES HERE, NOT IN THE TEMPLATE =====
//
// *"Any $0 trophy is unredeemable. **Enforced at the redeem action, not just
// hidden in the UI.**"* So the page renders a Redeem button on every holding,
// including the collectables, and this is where the answer comes from. Hiding
// the button would satisfy a reader of the screen and nobody else: a form post
// is a string, and a rule that only a template knows is a rule until somebody
// posts to the endpoint.
//
// Nothing here decides anything. `checkEligibility` and `requestRedemption`
// hold all four conditions (R1: 18+, verified email, allowed country, and a
// trophy the vault accounts for), and this file's whole job is to call them
// and carry their words back to the screen unchanged. A second opinion in an
// action is how a UI ends up kinder than the rule.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, isDemoMode } from "../../lib/db/index.ts";
import { currentGamer } from "../../lib/auth/current.ts";
import {
  requestRedemption,
  RedemptionRefused,
  REDEEM_METHODS,
  type RedeemMethod,
} from "../../lib/trophies/redemption.ts";
import {
  beginEmailVerification,
  confirmEmailVerification,
  looksLikeEmail,
} from "../../lib/identity/verify.ts";

function backTo(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  // Written without a nested template on purpose. `94-reachability` reads the
  // redirect target out of the source, and a backtick inside the capture cuts
  // the string in half — so the guard sees `/redeem${qs ` and calls a real
  // route broken. Trap 6's guard can only check what it can parse, and code
  // it cannot parse is code it cannot cover.
  redirect(qs ? `/redeem?${qs}` : "/redeem");
}

/**
 * Request a payout for one trophy.
 *
 * Every refusal `checkEligibility` can give comes back through here in its own
 * words — including `zero_value`, which is the one the UI is most tempted to
 * pre-empt.
 */
export async function requestRedemptionAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/login?next=/redeem");

  const userTrophyId = String(form.get("userTrophyId") ?? "");
  const method = String(form.get("method") ?? "") as RedeemMethod;
  const handle = String(form.get("providerHandle") ?? "").trim();

  if (!(REDEEM_METHODS as readonly string[]).includes(method)) {
    backTo({ error: "Pick how you want to be paid.", focus: userTrophyId });
  }

  try {
    const db = await getDb();
    await requestRedemption(db, {
      userTrophyId,
      userId: gamer.id,
      method,
      // House rule 5 — a **preference word** and an **opaque provider handle**.
      // Never an IBAN, never a card, never a last four. The schema has nowhere
      // to put one and `02-structural` fails the build if a column appears
      // that could.
      providerHandle: handle || null,
    });
  } catch (e) {
    if (e instanceof RedemptionRefused) {
      backTo({ error: e.message, code: e.code, focus: userTrophyId });
    }
    throw e;
  }

  revalidatePath("/redeem");
  backTo({ requested: "1" });
}

/**
 * G3 — a Discord gamer is asked for an email **only at redemption**, and it is
 * verified then.
 *
 * I7a — and an email gamer is never asked at all, because signup already
 * verified the same field. That is why this reads `emailVerifiedAt` rather
 * than keeping a redemption-specific flag: one fact, one column, asked once.
 */
export async function beginVerificationAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/login?next=/redeem");

  const email = String(form.get("email") ?? "").trim();
  if (!looksLikeEmail(email)) {
    backTo({ error: "That does not look like an email address." });
  }

  const db = await getDb();
  const code = await beginEmailVerification(db, gamer.id, email);
  // Demo only, and fenced on the absence of a real database: the screenshot
  // record has to walk this flow and there is no inbox to walk it with.
  backTo({ sent: "1", ...(isDemoMode ? { code } : {}) });
}

export async function confirmVerificationAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/login?next=/redeem");

  const db = await getDb();
  const result = await confirmEmailVerification(db, gamer.id, String(form.get("code") ?? ""));
  if (!result.ok) backTo({ error: result.reason, sent: "1" });

  revalidatePath("/redeem");
  backTo({ verified: "1" });
}
