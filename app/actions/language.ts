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

// Override a UI string in a given locale (stored in ui.overrides.<locale> JSON).
// Works for both English and Arabic, so admins can edit every word in either
// language. Empty value clears the override (falls back to the built-in).
export async function saveUiString(key: string, locale: string, value: string) {
  await requireStaff();
  if (!key) return { error: "Missing key." };
  const loc = locale === "ar" ? "ar" : "en";
  const storeKey = `ui.overrides.${loc}`;
  const { getRawContent, setContent } = await import("@/lib/cms");
  const raw = (await getRawContent([storeKey], "en"))[storeKey];
  let map: Record<string, string> = {};
  try { if (raw) { const j = JSON.parse(raw); if (j && typeof j === "object") map = j; } } catch { /* reset */ }
  if (value.trim()) map[key] = value.trim(); else delete map[key];
  await setContent(storeKey, JSON.stringify(map), "en");
  const { invalidateUiOverrides } = await import("@/lib/i18n/t-server");
  invalidateUiOverrides();
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
