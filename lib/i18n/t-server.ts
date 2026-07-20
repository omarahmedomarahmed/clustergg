import { getContent } from "@/lib/cms";
import { getLocale } from "./server";
import { t as tKey, tr as trText, type StringKey } from "./strings";
import type { Locale } from "./locale";

// Admin overrides for UI strings live in two CMS keys — ui.overrides.en and
// ui.overrides.ar — each a JSON map { key-or-english-text: value }. They win
// over the built-in dictionary, so admins can edit BOTH the English and the
// Arabic of any string. Cached in-process for a minute.
let cache: { en: Record<string, string>; ar: Record<string, string>; exp: number } | null = null;

async function loadMaps() {
  if (cache && cache.exp > Date.now()) return cache;
  let en: Record<string, string> = {}, ar: Record<string, string> = {};
  try {
    const c = await getContent(["ui.overrides.en", "ui.overrides.ar"], "en");
    try { if (c["ui.overrides.en"]) { const j = JSON.parse(c["ui.overrides.en"]); if (j && typeof j === "object") en = j; } } catch { /* ignore */ }
    try { if (c["ui.overrides.ar"]) { const j = JSON.parse(c["ui.overrides.ar"]); if (j && typeof j === "object") ar = j; } } catch { /* ignore */ }
  } catch { /* none */ }
  cache = { en, ar, exp: Date.now() + 60_000 };
  return cache;
}
export function invalidateUiOverrides() { cache = null; }

// The override map for a locale (applied even in English so admins can edit EN).
export async function getUiOverrides(locale: Locale): Promise<Record<string, string>> {
  const m = await loadMaps();
  return locale === "ar" ? m.ar : m.en;
}

// Server-side translator for server components.
export async function getT(fallbackUserLocale?: string | null): Promise<{
  locale: Locale; overrides: Record<string, string>;
  t: (k: StringKey) => string; tr: (text: string) => string;
}> {
  const locale = await getLocale(fallbackUserLocale);
  const overrides = await getUiOverrides(locale);
  return {
    locale, overrides,
    t: (k) => tKey(locale, k, overrides),
    tr: (text) => trText(locale, text, overrides),
  };
}
