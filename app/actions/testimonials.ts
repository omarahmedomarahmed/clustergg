"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// Recording what a player said.
//
// Every field here is typed by a member of staff who spoke to the person. There
// is deliberately no import, no generation and no "suggested quote" — a
// testimonial that nobody said is worse for the brand than an empty section,
// because the one thing a quote is for is being believed.

async function audit(adminId: string, action: string, targetId?: string) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(), adminId, action, targetType: "testimonial", targetId, meta: {},
    });
  } catch { /* an unrecorded audit entry must not undo the action */ }
}

export async function saveTestimonial(formData: FormData) {
  const staff = await requireStaff();
  const db = await getDb();

  const id = String(formData.get("testimonialId") ?? "");
  const brandId = String(formData.get("brandId") ?? "").trim();
  const quote = String(formData.get("quote") ?? "").trim();
  if (!brandId || !quote) return;

  const values = {
    brandId,
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
    challengeId: String(formData.get("challengeId") ?? "").trim() || null,
    userId: String(formData.get("userId") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim().slice(0, 80),
    quote: quote.slice(0, 600),
    status: String(formData.get("status") ?? "published") === "draft" ? "draft" : "published",
  };

  if (id) {
    await db.update(schema.brandTestimonials).set(values)
      .where(eq(schema.brandTestimonials.id, id));
    await audit(staff.id, "testimonial.update", id);
  } else {
    const newId = uid();
    await db.insert(schema.brandTestimonials).values({ id: newId, ...values });
    await audit(staff.id, "testimonial.create", newId);
  }
  revalidatePath("/admin/brands");
}

export async function deleteTestimonial(id: string) {
  const staff = await requireStaff();
  const db = await getDb();
  await db.delete(schema.brandTestimonials).where(eq(schema.brandTestimonials.id, id));
  await audit(staff.id, "testimonial.delete", id);
  revalidatePath("/admin/brands");
}
