"use server";

// The three onboarding steps as server actions.
//
// Every one of them re-checks in the action what the screen already filtered:
// a form post is not a dropdown. The rule each enforces lives in
// `lib/identity/*` and is called from here — this file decides nothing.
//
// A refusal is carried back as a query parameter rather than swallowed, and
// the text is **the message the module that refused actually produced**. The
// journeys document is explicit that a refused gamer is told which of the
// three steps is missing, or why a country was rejected; a generic "something
// went wrong" would satisfy the code and fail the product.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../../lib/db/index.ts";
import { currentGamer, signOut } from "../../lib/auth/current.ts";
import { setAgeBand, setCountry } from "../../lib/identity/gamers.ts";
import { linkAccount } from "../../lib/identity/accounts.ts";
import {
  blockUnderThirteen,
  registrationFingerprint,
  isAgeBand,
} from "../../lib/identity/age.ts";
import { authSecret } from "../../lib/core/secret.ts";
import { eq } from "drizzle-orm";

function refuse(message: string): never {
  redirect(`/onboarding?error=${encodeURIComponent(message)}`);
}

function reasonFrom(e: unknown): string {
  return e instanceof Error ? e.message : "That did not work.";
}

export async function linkAccountAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/signup");

  const provider = String(form.get("provider") ?? "");
  const name = String(form.get("inGameName") ?? "").trim();
  if (!provider || !name) refuse("Pick a game and enter your in-game name.");

  const db = await getDb();
  try {
    // Stage 2 replaces this with a real provider resolution: the name goes to
    // the publisher's API, and what comes back is the account id and whether
    // ownership can be proven at all. Until then the name IS the identifier
    // and the method is `claimed` — which is honestly what it is, and which
    // `isProven()` correctly refuses to call verified.
    await linkAccount(db, {
      userId: gamer.id,
      provider,
      providerAccountId: `${provider}:${name.toLowerCase()}`,
      inGameName: name,
      verifiedMethod: "claimed",
    });
  } catch (e) {
    refuse(reasonFrom(e));
  }
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

export async function setAgeBandAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/signup");

  const band = String(form.get("ageBand") ?? "");
  if (!isAgeBand(band)) refuse("Pick one of the two bands.");

  const db = await getDb();
  try {
    await setAgeBand(db, gamer.id, band);
  } catch (e) {
    refuse(reasonFrom(e));
  }
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

/**
 * The under-13 link.
 *
 * Not a third band. It deletes the account and keeps a salted fingerprint so
 * the same person cannot come back and answer differently (U3). They are
 * signed out immediately — there is nothing left to be signed in to.
 */
export async function underThirteenAction(): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/");

  const db = await getDb();
  const [row] = await db
    .select({ discordId: schema.users.discordId, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, gamer.id));

  await blockUnderThirteen(
    db,
    gamer.id,
    registrationFingerprint({
      discordId: row?.discordId ?? null,
      email: row?.email ?? null,
      salt: authSecret(),
    }),
  );
  await signOut();
  redirect("/goodbye");
}

export async function setCountryAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/signup");

  const db = await getDb();
  try {
    await setCountry(db, gamer.id, String(form.get("country") ?? ""));
  } catch (e) {
    refuse(reasonFrom(e));
  }
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}
