"use server";

// Every write a brand can make.
//
// Same rule as the owner's actions: each one re-checks the session, because a
// Server Action is an endpoint and the layout that rendered the form is not in
// its call stack. The gate above a page does not gate a POST.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../../../../lib/db/index.ts";
import { brandPortalOpen } from "../../../../lib/portal/session.ts";
import { confirmAndPay, onInvoicePaid, BuilderRefused } from "../../../../lib/portal/brand.ts";
import { requireBrandPortal } from "../../../../lib/portal/session.ts";
import { threadFor, postMessage } from "../../../../lib/messages/threads.ts";

async function guard(brandId: string): Promise<void> {
  if (!(await brandPortalOpen(brandId))) {
    throw new Error("That portal is not open to you.");
  }
}

/**
 * Checkout. B4 — everything was priced and dated *before* this button.
 *
 * B9 — a series is billed together and a single challenge alone, which is why
 * `confirmAndPay` makes one invoice with a line per challenge. Paying it here
 * is the demo standing in for Stripe's webhook; `onInvoicePaid` is the same
 * function the webhook calls, so the path that turns money into scheduled
 * challenges is exercised either way.
 */
export async function checkoutAction(form: FormData): Promise<void> {
  const brandId = String(form.get("brandId"));
  await guard(brandId);
  const db = await getDb();

  const games = form.getAll("game").map(String).filter(Boolean);
  const challengesPerGame = Number(form.get("challengesPerGame") ?? 1);
  const weeks = Number(form.get("weeks") ?? 1);
  const startingWeek = new Date(String(form.get("startingWeek") ?? ""));

  try {
    const { invoiceId } = await confirmAndPay(db, {
      brandId,
      games,
      challengesPerGame,
      startingWeek,
      weeks,
    });
    await onInvoicePaid(db, invoiceId);
    revalidatePath(`/portal/brand/${brandId}`);
    redirect(`/portal/brand/${brandId}/challenges?bought=${invoiceId}`);
  } catch (e) {
    if (e instanceof BuilderRefused) {
      redirect(`/portal/brand/${brandId}/builder?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
}

/** H5 — the brand's side of the conversation. */
export async function sendBrandMessageAction(form: FormData): Promise<void> {
  const brandId = String(form.get("brandId"));
  await requireBrandPortal(brandId);
  const db = await getDb();
  const threadId = await threadFor(db, { side: "brand", brandId });
  const body = String(form.get("body") ?? "");
  if (body.trim()) {
    await postMessage(db, { threadId, authorKind: "brand", authorId: brandId, body });
  }
  revalidatePath(`/portal/brand/${brandId}/messages`);
  redirect(`/portal/brand/${brandId}/messages`);
}
