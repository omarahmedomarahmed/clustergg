import { getContent } from "@/lib/cms";
import { getLocale } from "./server";
import { t as base, type StringKey } from "./strings";
import type { Locale } from "./locale";

// Admin overrides for UI dictionary strings live in ONE CMS key (ui.overrides,
// Arabic namespace) as a JSON map { key: value }. They win over the built-in
// Arabic. Cached in-process for a minute.
let cache: { map: Record<string, string>; exp: number } | null = null;

export async function getUiOverrides(locale: Locale): Promise<Record<string, string>> {
  if (locale !== "ar") return {};
  if (cache && cache.exp > Date.now()) return cache.map;
  let map: Record<string, string> = {};
  try {
    const raw = (await getContent(["ui.overrides"], "ar"))["ui.overrides"];
    if (raw) { const j = JSON.parse(raw); if (j && typeof j === "object") map = j as Record<string, string>; }
  } catch { /* none */ }
  cache = { map, exp: Date.now() + 60_000 };
  return map;
}
export function invalidateUiOverrides() { cache = null; }

// Server-side translator for server components: resolves locale + admin overrides.
export async function getT(fallbackUserLocale?: string | null): Promise<{ locale: Locale; overrides: Record<string, string>; t: (k: StringKey) => string }> {
  const locale = await getLocale(fallbackUserLocale);
  const overrides = await getUiOverrides(locale);
  return { locale, overrides, t: (k) => base(locale, k, overrides) };
}
