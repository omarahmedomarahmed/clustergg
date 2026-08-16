"use server";

// The two writes that can open the admin console.
//
// Both re-check the actor's department against ST1, because a Server Action is
// an endpoint and the layout that rendered the form is not in its call stack.
// This is the action where that matters most: everything else in the console
// moves money or a challenge, and this one moves *who may*.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../../../lib/db/index.ts";
import { currentStaff } from "../../../lib/admin/session.ts";
import { createStaffTitle, grantStaffTitle, StaffRefused } from "../../../lib/admin/staff.ts";

async function attempt(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    revalidatePath("/admin/staff");
    redirect("/admin/staff?saved=1");
  } catch (e) {
    if (e instanceof StaffRefused) {
      redirect(`/admin/staff?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
}

export async function createTitleAction(form: FormData): Promise<void> {
  const staff = await currentStaff();
  const db = await getDb();
  await attempt(async () => {
    await createStaffTitle(db, {
      name: String(form.get("name") ?? ""),
      departments: form.getAll("departments").map(String),
      actorDepartment: staff?.department ?? null,
      actorId: staff?.userId ?? "unknown",
    });
  });
}

export async function grantTitleAction(form: FormData): Promise<void> {
  const staff = await currentStaff();
  const db = await getDb();
  const titleId = String(form.get("titleId") ?? "");
  await attempt(async () => {
    await grantStaffTitle(db, {
      userId: String(form.get("userId") ?? ""),
      titleId: titleId || null,
      actorDepartment: staff?.department ?? null,
      actorId: staff?.userId ?? "unknown",
    });
  });
}
