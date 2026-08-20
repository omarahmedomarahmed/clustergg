"use server";

// The brand signup. `04-SURFACES` §3 step 1, `06-JOURNEYS` §3 step 1.
//
// Both documents begin the entire commercial funnel here and the page did not
// exist. Neither did any other way to create a brand: `signUpBrand`'s only
// caller on this branch was the demo seeder, so **no brand could sign up and no
// brand could sign in** — B1's one-time key was minted, hashed, and returned to
// a fixture.
//
// This action decides nothing that `signUpBrand` does not. It reads two fields,
// hands them over, and lets the email carry the key.

import { redirect } from "next/navigation";
import { getDb } from "../../lib/db/index.ts";
import { looksLikeEmail } from "../../lib/identity/verify.ts";

function back(params: Record<string, string>): never {
  redirect(`/brands?${new URLSearchParams(params).toString()}`);
}

export async function brandSignUpAction(form: FormData): Promise<void> {
  const name = String(form.get("name") ?? "").trim();
  const contactEmail = String(form.get("contactEmail") ?? "").trim();

  if (!name) back({ error: "Tell us the brand's name." });
  if (!looksLikeEmail(contactEmail)) {
    back({ error: "That does not look like an email address.", name });
  }

  const db = await getDb();
  const { signUpBrand } = await import("../../lib/portal/brand.ts");
  try {
    await signUpBrand(db, { name, contactEmail });
  } catch (e) {
    back({ error: e instanceof Error ? e.message : "That did not work.", name });
  }

  // ===== THE KEY IS NOT IN THIS REDIRECT, AND THAT IS DELIBERATE =====
  //
  // B1's invite is redeemable once and it is the only thing standing between a
  // stranger and a brand's dashboard. Putting it in a query string would put it
  // in browser history, in the Referer header of every outbound link on the
  // page they land on, and in any log in front of us. It goes to the address
  // they typed, which is also the check that the address is theirs.
  //
  // `signUpBrand` sends it and cannot throw: a send that fails is a row an
  // operator sees on `/admin/preflight`, and the key is still readable there —
  // not a signup that half-happened.
  back({ sent: contactEmail });
}
