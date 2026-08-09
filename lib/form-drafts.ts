// A half-built thing, kept. B91.8.
//
// ===== WHY =====
//
// A brand builds a campaign, gets interrupted, closes the tab, and comes back
// to an empty form. So does a server owner requesting a challenge, and so does
// a staff member halfway through a bespoke deal. Every one of those is somebody
// who already decided to give us money and then had to start again, which is
// the cheapest place there is to lose a customer.
//
// ===== WHAT IS AND IS NOT KEPT =====
//
// One row per (owner, form). A resumption point, not version control: keeping
// every keystroke would make this table larger than the things it is drafts of,
// and nobody has ever wanted to restore the fourth-from-last version of a form.
//
// The payload is whatever the form had. It is NEVER trusted on the way back in
// — it is rendered into inputs the user can see and edit, and the real action
// validates it exactly as it would a fresh submission. A draft is a
// convenience, not a shortcut past the checks.
//
// ===== WHO CAN READ ONE =====
//
// A draft belongs to an owner, and the owner is proved by the same session that
// proves anything else about them: a brand's portal session, a server's portal
// session, a staff login. `app/actions/drafts.ts` is where that is enforced —
// nothing in this file decides who may call it, and that separation is
// deliberate: a lib that also does auth is a lib somebody calls from a place
// that has none.

import { and, desc, eq, lt } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

export type DraftOwner = "brand" | "server" | "staff";

/**
 * How big a draft may be.
 *
 * A form is text and choices; anything approaching this is either an image
 * somebody pasted into a field or a bug looping over its own state. Both should
 * be refused rather than stored — a table of megabyte rows is a slow console
 * for everybody.
 */
export const MAX_DRAFT_BYTES = 64 * 1024;

/** Drafts older than this are somebody's abandoned tab, not work in progress. */
export const DRAFT_TTL_DAYS = 45;

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveDraft(
  db: DB,
  d: { ownerType: DraftOwner; ownerId: string; formKey: string; payload: Record<string, unknown>; label?: string },
): Promise<SaveResult> {
  if (!d.ownerId || !d.formKey) return { ok: false, error: "Nothing to save against." };

  let size = 0;
  try { size = JSON.stringify(d.payload ?? {}).length; }
  catch { return { ok: false, error: "That form has something in it we cannot store." }; }
  if (size > MAX_DRAFT_BYTES) {
    return { ok: false, error: "This draft is too large to keep — it will still submit, it just will not be saved as you type." };
  }

  try {
    const [existing] = await db.select({ id: schema.formDrafts.id }).from(schema.formDrafts)
      .where(and(
        eq(schema.formDrafts.ownerType, d.ownerType),
        eq(schema.formDrafts.ownerId, d.ownerId),
        eq(schema.formDrafts.formKey, d.formKey),
      )).limit(1);

    if (existing) {
      await db.update(schema.formDrafts)
        .set({ payload: d.payload ?? {}, label: (d.label ?? "").slice(0, 160), updatedAt: new Date() })
        .where(eq(schema.formDrafts.id, existing.id));
    } else {
      await db.insert(schema.formDrafts).values({
        id: uid(), ownerType: d.ownerType, ownerId: d.ownerId, formKey: d.formKey,
        payload: d.payload ?? {}, label: (d.label ?? "").slice(0, 160), updatedAt: new Date(),
      });
    }
    return { ok: true };
  } catch {
    // A draft that fails to save must never fail the form it is on. The person
    // typing has lost nothing yet — they still have it on screen.
    return { ok: false, error: "Could not save your progress just now." };
  }
}

export type Draft = {
  formKey: string;
  ownerType: string;
  ownerId: string;
  label: string;
  payload: Record<string, unknown>;
  updatedAt: Date;
};

export async function loadDraft(
  db: DB, ownerType: DraftOwner, ownerId: string, formKey: string,
): Promise<Draft | null> {
  try {
    const [row] = await db.select().from(schema.formDrafts)
      .where(and(
        eq(schema.formDrafts.ownerType, ownerType),
        eq(schema.formDrafts.ownerId, ownerId),
        eq(schema.formDrafts.formKey, formKey),
      )).limit(1);
    return row ? { ...row, payload: row.payload ?? {} } : null;
  } catch { return null; }
}

/** Done with it — the real thing was submitted, or they threw it away. */
export async function clearDraft(
  db: DB, ownerType: DraftOwner, ownerId: string, formKey: string,
): Promise<void> {
  try {
    await db.delete(schema.formDrafts).where(and(
      eq(schema.formDrafts.ownerType, ownerType),
      eq(schema.formDrafts.ownerId, ownerId),
      eq(schema.formDrafts.formKey, formKey),
    ));
  } catch { /* a stale draft is harmless; failing the submit is not */ }
}

/**
 * Every open draft, newest first — the admin view.
 *
 * This is a SALES LIST, not a debugging tool. A brand with a half-built
 * campaign is somebody who was trying to buy something and stopped, and that is
 * worth a phone call the same day.
 */
export async function listDrafts(db: DB, ownerType?: DraftOwner, limit = 100): Promise<Draft[]> {
  try {
    const rows = await db.select().from(schema.formDrafts)
      .where(ownerType ? eq(schema.formDrafts.ownerType, ownerType) : undefined)
      .orderBy(desc(schema.formDrafts.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, payload: r.payload ?? {} }));
  } catch { return []; }
}

/** Sweep the abandoned ones. Called from the daily job. */
export async function pruneDrafts(db: DB, olderThanDays = DRAFT_TTL_DAYS): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - olderThanDays * 86400_000);
    const doomed = await db.select({ id: schema.formDrafts.id }).from(schema.formDrafts)
      .where(lt(schema.formDrafts.updatedAt, cutoff));
    for (const d of doomed) {
      await db.delete(schema.formDrafts).where(eq(schema.formDrafts.id, d.id));
    }
    return doomed.length;
  } catch { return 0; }
}
