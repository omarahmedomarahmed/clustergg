// Locale primitives — client-safe (no server imports), shared by the toggle,
// the layout and the string dictionary.

export type Locale = "en" | "ar";

export const LOCALE_COOKIE = "cluster_locale";

export const LOCALES: { code: Locale; label: string; native: string; flag: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", native: "English", flag: "🇺🇸", dir: "ltr" },
  { code: "ar", label: "Arabic", native: "العربية", flag: "🇪🇬", dir: "rtl" },
];

export function normalizeLocale(v: unknown): Locale {
  return v === "ar" ? "ar" : "en";
}
export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
export function localeMeta(locale: Locale) {
  return LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
}
