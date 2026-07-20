"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n/locale";

// Switch the site language. Writes the cookie (source of truth) and, when signed
// in, persists it to the gamer's profile so it follows them across devices.
export async function setLocale(loc: string) {
  const locale = normalizeLocale(loc);
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const me = await getCurrentUser().catch(() => null);
  if (me) {
    const db = await getDb();
    await db.update(schema.users).set({ locale }).where(eq(schema.users.id, me.id));
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// Profile customisation: the gamer's country flag (+ optional language). Shown
// next to their name everywhere.
export async function saveProfileFlag(country: string, locale?: string) {
  const me = await getCurrentUser();
  if (!me) return { error: "Sign in first." };
  const db = await getDb();
  const code = (country || "").trim().toUpperCase();
  const patch: Record<string, unknown> = { country: /^[A-Z]{2}$/.test(code) ? code : null };
  if (locale) patch.locale = normalizeLocale(locale);
  await db.update(schema.users).set(patch).where(eq(schema.users.id, me.id));
  if (locale) (await cookies()).set(LOCALE_COOKIE, normalizeLocale(locale), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  revalidatePath(`/u/${me.slug}`);
  return { ok: true };
}
