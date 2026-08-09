"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { BAND_LABEL, changeBand, MAX_BAND_CHANGES, parseBand, type AgeBand } from "@/lib/age";

export type BandState = { ok?: true; band?: AgeBand; locked?: boolean; error?: string } | undefined;

/**
 * Set or correct the age band. B72.4.
 *
 * ANSWERED ONCE. B95 set `MAX_BAND_CHANGES` to zero, so what this action does
 * now is set a band that has never been set — and refuse everything else with
 * the sentence that tells somebody how to get it corrected by a human.
 *
 * It was three self-serve changes, on the reasoning that the band was asked in
 * one tap with no confirm and mis-taps were therefore inevitable. The onboarding
 * page designed the mis-tap out (select, read what it means, press confirm),
 * which left the change budget doing only one thing: letting a teenager pick
 * "18 or over" on the day they want to cash out. The band is the only thing
 * standing between a minor and a payment we may not make, and a fact somebody
 * can rewrite when it becomes inconvenient is not a fact.
 *
 * Every set is timestamped. That record — that we asked, and when — is half of
 * what the band is for.
 */
export async function setAgeBand(_prev: BandState, formData: FormData): Promise<BandState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Sign in first." };

  const db = await getDb();
  const [row] = await db.select({
    band: schema.users.ageBand,
    changes: schema.users.ageBandChanges,
  }).from(schema.users).where(eq(schema.users.id, me.id)).limit(1);

  const current = parseBand(row?.band);
  const changes = Number(row?.changes ?? 0);
  const decision = changeBand(current, changes, formData.get("band"));
  if (!decision.ok) return { error: decision.error };

  // Answering for the first time is not a change. Charging somebody a change
  // for answering the question would make the first mis-tap cost two.
  const isChange = !!current && decision.band !== current;

  await db.update(schema.users).set({
    ageBand: decision.band,
    ageBandSetAt: new Date(),
    ...(isChange ? { ageBandChanges: changes + 1 } : {}),
  }).where(eq(schema.users.id, me.id));

  // The whole layout, not a list of pages. `<OnboardingBar>` is rendered by the
  // root layout on EVERY page, so revalidating five gamer routes would leave the
  // "nothing is earning" bar on top of every other page until a hard reload —
  // telling somebody who just answered that they still have not.
  revalidatePath("/", "layout");
  return { ok: true, band: decision.band, locked: decision.locked };
}

/** What the settings page needs, without it reaching into the schema itself. */
export async function myAgeBand() {
  const me = await getCurrentUser();
  if (!me) return null;
  const db = await getDb();
  const [row] = await db.select({
    band: schema.users.ageBand,
    setAt: schema.users.ageBandSetAt,
    changes: schema.users.ageBandChanges,
  }).from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
  const band = parseBand(row?.band);
  const changes = Number(row?.changes ?? 0);
  return {
    band,
    label: band ? BAND_LABEL[band] : null,
    setAt: row?.setAt ?? null,
    changes,
    left: Math.max(0, MAX_BAND_CHANGES - changes),
    locked: changes >= MAX_BAND_CHANGES,
  };
}
