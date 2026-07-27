"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { submitEnquiry } from "@/lib/brand-enquiries";
import { requireStaff } from "@/lib/auth";

export type EnquiryState = { ok?: string; error?: string };

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}

// The public "talk to us" form.
//
// Unauthenticated by design — a brand evaluating us has no account and asking
// them to make one before they can ask a question loses the lead. The write is
// bounded and validated in `lib/brand-enquiries.ts`.
export async function sendEnquiry(_prev: EnquiryState, fd: FormData): Promise<EnquiryState> {
  // Honeypot: a field positioned off-screen and never shown to a human. Bots
  // fill every input they find; people can't fill one they can't see.
  if (str(fd, "website_url").trim()) return { ok: "Thanks — we'll be in touch." };

  const res = await submitEnquiry({
    company: str(fd, "company"),
    contactName: str(fd, "contactName"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    website: str(fd, "website"),
    message: str(fd, "message"),
    tier: str(fd, "tier"),
    games: Number(str(fd, "games")),
    addon: str(fd, "addon") === "on" || str(fd, "addon") === "true",
    billing: str(fd, "billing"),
    quotedMonthly: Number(str(fd, "quotedMonthly")),
  });

  if (!res.ok) {
    const msg: Record<string, string> = {
      no_company: "Tell us the company name.",
      bad_email: "That email doesn't look right — check it and try again.",
      too_many: "We're getting a lot of enquiries right now. Email partners@clustergg.com and we'll pick it up.",
      error: "Something went wrong our end. Email partners@clustergg.com and we'll sort it.",
    };
    return { error: msg[res.reason] ?? msg.error };
  }
  revalidatePath("/admin/brand-enquiries");
  return { ok: "Got it. We'll come back to you within one business day." };
}

// ===== Staff side =====

export async function updateEnquiry(_prev: EnquiryState, fd: FormData): Promise<EnquiryState> {
  await requireStaff();
  const id = str(fd, "id");
  if (!id) return { error: "Missing enquiry." };
  const status = str(fd, "status");
  const allowed = new Set(["new", "contacted", "won", "lost"]);
  const db = await getDb();
  await db.update(schema.brandEnquiries)
    .set({
      status: allowed.has(status) ? status : "new",
      note: str(fd, "note").slice(0, 4000) || null,
    })
    .where(eq(schema.brandEnquiries.id, id));
  revalidatePath("/admin/brand-enquiries");
  return { ok: "Saved." };
}
