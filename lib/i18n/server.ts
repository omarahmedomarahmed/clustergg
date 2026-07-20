import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "./locale";

// Resolve the active locale for the current request: the cookie wins (set by the
// toggle / onboarding), else the signed-in gamer's saved preference, else English.
export async function getLocale(fallbackUserLocale?: string | null): Promise<Locale> {
  try {
    const c = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (c) return normalizeLocale(c);
  } catch { /* outside a request scope */ }
  return normalizeLocale(fallbackUserLocale ?? "en");
}
