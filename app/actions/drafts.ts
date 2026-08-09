"use server";

import { getDb } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { hasPortalSession } from "@/lib/portal-auth";
import { saveDraft, loadDraft, clearDraft, type DraftOwner } from "@/lib/form-drafts";

// Who may read and write a draft. B91.8.
//
// This file is the whole access-control story for drafts, on purpose — nothing
// in `lib/form-drafts.ts` decides who may call it, because a library that also
// does auth is a library somebody calls from a place that has none.
//
// The rule is the same one every other customer-facing surface uses: a brand is
// proved by its portal session, a server by its portal session, a staff member
// by being staff. There is no shared "just pass the owner id" path, because a
// draft can contain a deal in progress — prices, targeting, which servers — and
// reading another brand's is reading their strategy.
//
// An ADMIN may read any of them. That is not an exception to the rule, it is
// the sales desk: a half-built campaign is somebody who was trying to buy
// something and stopped.

export type DraftState = { ok?: true; error?: string };

async function allowed(ownerType: DraftOwner, ownerId: string): Promise<boolean> {
  if (!ownerId) return false;
  const user = await getCurrentUser();
  if (user && isStaff(user)) return true;

  if (ownerType === "staff") return false;              // staff is proved above, never by an id
  if (ownerType === "brand") return hasPortalSession("brand", ownerId);
  if (ownerType === "server") return hasPortalSession("server", ownerId);
  return false;
}

export async function saveFormDraft(
  ownerType: DraftOwner, ownerId: string, formKey: string,
  payload: Record<string, unknown>, label?: string,
): Promise<DraftState> {
  // Staff drafts belong to the person, not to an id they can type.
  if (ownerType === "staff") {
    const user = await getCurrentUser();
    if (!user || !isStaff(user)) return { error: "Sign in first." };
    ownerId = user.id;
  } else if (!(await allowed(ownerType, ownerId))) {
    return { error: "Open your portal first." };
  }

  const db = await getDb();
  const res = await saveDraft(db, { ownerType, ownerId, formKey, payload, label });
  return res.ok ? { ok: true } : { error: res.error };
}

export async function readFormDraft(
  ownerType: DraftOwner, ownerId: string, formKey: string,
): Promise<{ payload: Record<string, unknown>; updatedAt: string } | null> {
  if (ownerType === "staff") {
    const user = await getCurrentUser();
    if (!user || !isStaff(user)) return null;
    ownerId = user.id;
  } else if (!(await allowed(ownerType, ownerId))) {
    return null;
  }
  const db = await getDb();
  const d = await loadDraft(db, ownerType, ownerId, formKey);
  return d ? { payload: d.payload, updatedAt: d.updatedAt.toISOString() } : null;
}

export async function discardFormDraft(
  ownerType: DraftOwner, ownerId: string, formKey: string,
): Promise<DraftState> {
  if (ownerType === "staff") {
    const user = await getCurrentUser();
    if (!user || !isStaff(user)) return { error: "Sign in first." };
    ownerId = user.id;
  } else if (!(await allowed(ownerType, ownerId))) {
    return { error: "Open your portal first." };
  }
  const db = await getDb();
  await clearDraft(db, ownerType, ownerId, formKey);
  return { ok: true };
}
