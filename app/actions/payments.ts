"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { setProvider } from "@/lib/payments";
import type { Flow } from "@/lib/payments/vendors";
import { uid } from "@/lib/utils";

// Choosing which provider handles which flow.
//
// The entire writable surface of the payments console, and it writes one word.
// No key, no secret, no endpoint — those are environment variables set in the
// hosting dashboard, deliberately outside anything a browser session can reach.
// The worst an attacker with admin access can do here is point a flow at a
// provider with no credentials, which fails closed to the manual workflow.
export async function chooseProvider(flow: Flow, formData: FormData): Promise<{ ok?: true; error?: string }> {
  const access = await requireSystemFor("/admin/payments");
  const provider = String(formData.get("provider") ?? "").trim();
  if (!provider) return { error: "Pick a provider." };

  await setProvider(flow, provider);

  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(), adminId: access.user.id, action: "payments.provider_set",
      targetType: "payments", targetId: flow, meta: { provider },
    });
  } catch { /* the log must never fail the setting */ }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/redeems");
  return { ok: true };
}
