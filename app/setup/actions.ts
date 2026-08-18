"use server";

// The one action that creates an administrator.
//
// 10-SETUP §2 rule 4 — *"There is no API-only path to creating an admin. The
// page is the only way."* This is a server action reached from `/setup` and
// nothing else calls it; there is deliberately no handler under `app/api` that
// can reach `createFirstAdmin`, and `95-deploy` asserts that stays true.

import { redirect } from "next/navigation";
import { getDb } from "../../lib/db/index.ts";
import { createFirstAdmin, SetupRefused } from "../../lib/admin/setup.ts";
import { CredentialRefused } from "../../lib/identity/credentials.ts";
import { signIn } from "../../lib/auth/current.ts";

export async function createFirstAdminAction(form: FormData): Promise<void> {
  const db = await getDb();
  let userId: string;
  try {
    userId = await createFirstAdmin(db, {
      token: String(form.get("token") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirm: String(form.get("confirm") ?? ""),
    });
  } catch (error) {
    // Both carry wording that is part of the spec, so it is passed through
    // unchanged rather than being replaced with a generic failure.
    if (error instanceof SetupRefused || error instanceof CredentialRefused) {
      redirect(`/setup?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  // *"It signs you straight in"* — step 5 of the walkthrough.
  await signIn(userId);
  redirect("/admin");
}
