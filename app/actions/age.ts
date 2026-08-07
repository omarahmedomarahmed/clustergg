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
 * THE CORRECTION PATH IS THE POINT. The band is asked as the first thing on
 * sign-in, in one click, with no confirm step — which is the right shape for
 * getting an honest answer quickly and guarantees that some people will
 * mis-tap. A mis-tap onto "Under 16" locks somebody out of the entire product,
 * and a gate with no way back is a support queue with extra steps.
 *
 * So it is editable from account settings, and counted. Three changes, the same
 * number and the same shape as the payout preference, then it locks and a human
 * has to be involved — because a band that can be changed without limit is a
 * band that means nothing, and somebody who moves between "twelve" and
 * "nineteen" three times is telling us something we should see rather than
 * silently absorb.
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

  // The whole layout, not a list of pages. `<AgeGate>` is rendered by the root
  // layout on EVERY page, so revalidating five gamer routes would leave the
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
