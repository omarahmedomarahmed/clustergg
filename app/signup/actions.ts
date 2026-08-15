"use server";

import { redirect } from "next/navigation";
import { getDb, isDemoMode } from "../../lib/db/index.ts";
import { createGamer, gamerByDiscordId } from "../../lib/identity/gamers.ts";
import { signIn } from "../../lib/auth/current.ts";
import { isBlocked, registrationFingerprint } from "../../lib/identity/age.ts";
import { authSecret } from "../../lib/core/secret.ts";

/**
 * The demo door.
 *
 * Refuses outright when the process has a real database. A sign-in path that
 * mints a session for any typed name is exactly the hole `lib/core/secret.ts`
 * was written to close, and it must not survive into a deployment that has
 * accounts in it.
 */
export async function demoSignInAction(form: FormData): Promise<void> {
  if (!isDemoMode) throw new Error("Demo sign-in is not available here.");

  const displayName = String(form.get("displayName") ?? "").trim() || "Demo Gamer";
  const db = await getDb();
  const discordId = `demo:${displayName.toLowerCase()}`;

  // Even the demo door honours the under-13 block. A path that skips it is a
  // path somebody will reach for when reproducing a bug.
  if (await isBlocked(db, registrationFingerprint({ discordId, salt: authSecret() }))) {
    redirect("/goodbye");
  }

  const existing = await gamerByDiscordId(db, discordId);
  const id = existing?.id ?? (await createGamer(db, { displayName, discordId }));
  await signIn(id);
  redirect("/onboarding");
}
