"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { setContent } from "@/lib/cms";
import { parseCountries } from "@/lib/flags";

// Save the Arabic translation for one CMS content key (stored under key@ar).
export async function saveArabicContent(key: string, value: string) {
  await requireStaff();
  if (!key) return { error: "Missing key." };
  await setContent(key, value.trim(), "ar");
  revalidatePath("/", "layout");
  revalidatePath("/admin/language");
  return { ok: true };
}

// Save the admin-editable roster of countries gamers can pick a flag from.
export async function saveCountries(json: string) {
  await requireStaff();
  const parsed = parseCountries(json); // validates + normalises
  await setContent("profile.countries", JSON.stringify(parsed.map((c) => ({ code: c.code, name: c.name }))), "en");
  revalidatePath("/", "layout");
  revalidatePath("/admin/language");
  return { ok: true, count: parsed.length };
}
