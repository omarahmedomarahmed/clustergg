"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { clearAlert } from "@/lib/staff-alerts";

// Clearing an alert is attributed. "Who picked this up" is the immediate next
// question when a lead goes cold, and an anonymous clear is how two people both
// ignore something, each assuming the other has it.
export async function clearStaffAlert(id: string): Promise<{ ok: true }> {
  const access = await requireSystemFor("/admin/alerts");
  const db = await getDb();
  await clearAlert(db, id, access.user.id);
  revalidatePath("/admin/alerts");
  return { ok: true };
}
