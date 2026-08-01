"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { saveDepartment, deleteDepartment, assignStaff } from "@/lib/departments";

// Building the org chart.
//
// Admin-only, and deliberately so: deciding who runs what is the one thing that
// cannot be delegated to the people it affects.

async function audit(adminId: string, action: string, targetId?: string) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(), adminId, action, targetType: "department", targetId, meta: {},
    });
  } catch { /* an unrecorded audit entry must not undo the change */ }
}

export type DeptState = { ok?: string; error?: string } | null;

export async function upsertDepartment(_prev: DeptState, formData: FormData): Promise<DeptState> {
  const admin = await requireAdmin();
  const id = String(formData.get("departmentId") ?? "") || undefined;
  const name = String(formData.get("name") ?? "");
  const purpose = String(formData.get("purpose") ?? "");
  const systems = formData.getAll("systems").map(String);

  const saved = await saveDepartment({ id, name, purpose, systems });
  if (!saved) return { error: "Give it a name." };
  await audit(admin.id, id ? "department.update" : "department.create", saved);
  revalidatePath("/admin/departments");
  revalidatePath("/admin");
  return { ok: id ? "Saved." : `${name} created.` };
}

export async function removeDepartment(departmentId: string): Promise<void> {
  const admin = await requireAdmin();
  await deleteDepartment(departmentId);
  await audit(admin.id, "department.delete", departmentId);
  revalidatePath("/admin/departments");
}

export async function placeStaff(_prev: DeptState, formData: FormData): Promise<DeptState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  if (!userId) return { error: "No one selected." };

  await assignStaff(userId, departmentId);
  await audit(admin.id, departmentId ? "department.assign" : "department.unassign", userId);
  revalidatePath("/admin/departments");
  revalidatePath("/admin");
  return { ok: departmentId ? "Moved." : "Removed from their department — they can now open nothing." };
}
