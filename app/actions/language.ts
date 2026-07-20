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

// Override one built-in UI dictionary string in Arabic (stored in the single
// ui.overrides@ar JSON map). Empty value clears the override (falls back to the
// built-in Arabic).
export async function saveUiString(key: string, value: string) {
  await requireStaff();
  if (!key) return { error: "Missing key." };
  const { getRawContent, setContent } = await import("@/lib/cms");
  const raw = (await getRawContent(["ui.overrides"], "ar"))["ui.overrides"];
  let map: Record<string, string> = {};
  try { if (raw) { const j = JSON.parse(raw); if (j && typeof j === "object") map = j; } } catch { /* reset */ }
  if (value.trim()) map[key] = value.trim(); else delete map[key];
  await setContent("ui.overrides", JSON.stringify(map), "ar");
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
