"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { sendEmail } from "@/lib/email";

export type ComposeState = { ok?: boolean; error?: string; message?: string } | undefined;

export type RecipientKind = "gamer" | "brand" | "server";

/**
 * Email one gamer, brand or server owner, by hand (B47).
 *
 * Goes through the same `sendEmail` path as every templated message, so it is
 * logged in the same console, degrades identically without a key, and wears the
 * same layout. A separate "just send this string" path would be the one thing in
 * the product that could send unlogged mail.
 *
 * **Plain text only.** The composer accepts no HTML: free-text HTML from an
 * admin console is a phishing vector wearing our own brand, and the value of
 * being able to bold a word is not worth owning that.
 *
 * The address is looked up from the id rather than accepted from the form. An
 * admin console that posts an arbitrary recipient is an open relay with a login
 * page in front of it.
 */
export async function sendAdminEmail(_prev: ComposeState, formData: FormData): Promise<ComposeState> {
  const access = await requireSystemFor("/admin/email");
  const kind = String(formData.get("kind") ?? "") as RecipientKind;
  const id = String(formData.get("recipientId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);

  if (!subject) return { error: "It needs a subject." };
  if (!body) return { error: "It needs a message." };
  if (!id) return { error: "Pick who it goes to." };

  const db = await getDb();
  let to = "";
  let who = "";
  try {
    if (kind === "gamer") {
      const [u] = await db.select({ email: schema.users.email, name: schema.users.displayName })
        .from(schema.users).where(eq(schema.users.id, id)).limit(1);
      to = u?.email ?? ""; who = u?.name ?? "";
    } else if (kind === "brand") {
      const [b] = await db.select({ email: schema.brands.contactEmail, name: schema.brands.name })
        .from(schema.brands).where(eq(schema.brands.id, id)).limit(1);
      to = b?.email ?? ""; who = b?.name ?? "";
    } else if (kind === "server") {
      const [g] = await db.select({ email: schema.discordGuilds.contactEmail, name: schema.discordGuilds.name })
        .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, id)).limit(1);
      to = g?.email ?? ""; who = g?.name ?? "";
    } else {
      return { error: "Unknown recipient type." };
    }
  } catch {
    return { error: "Could not look that recipient up." };
  }

  // The whole reason the server picker shows addressless servers at all: "we
  // cannot reach them" is a fact this console exists to surface, so it says so
  // rather than failing quietly.
  if (!to) return { error: `${who || "That recipient"} has no contact email on file, so there is nowhere to send this.` };

  const res = await sendEmail({
    to, template: "admin.message", data: { subject, body },
    // Stamped with WHO sent it, because a free-text mail from a console has to
    // be attributable afterwards.
    ref: { type: `admin:${kind}:${access.user.id}`, id },
  });

  revalidatePath("/admin/email");
  if (res.skipped) return { ok: true, message: `Recorded for ${who} <${to}> — sending is off, so nothing left the building.` };
  if (!res.ok) return { error: `Resend refused it. The reason is in the log below.` };
  return { ok: true, message: `Sent to ${who} <${to}>.` };
}
