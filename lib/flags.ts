// Country flags shown next to a gamer's name everywhere. A flag is derived from
// the ISO-3166 alpha-2 country code via regional-indicator symbols, so it always
// matches the correct flag with no image assets. Admins control WHICH countries
// gamers may pick (and their display names) via an editable list in the CMS.

export type Country = { code: string; name: string; emoji?: string };

// Emoji flag from a 2-letter ISO code (e.g. "EG" → 🇪🇬). Empty for invalid codes.
export function flagEmoji(code?: string | null): string {
  const c = (code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// A broad default roster, gaming hubs first (Egypt + USA lead — the two the
// product cares about). Admin-overridable via the CMS `profile.countries` key.
export const DEFAULT_COUNTRIES: Country[] = [
  { code: "EG", name: "Egypt" }, { code: "US", name: "United States" },
  { code: "SA", name: "Saudi Arabia" }, { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" }, { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "ES", name: "Spain" }, { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" }, { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" }, { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" }, { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" }, { code: "TR", name: "Turkey" },
  { code: "RU", name: "Russia" }, { code: "UA", name: "Ukraine" },
  { code: "MA", name: "Morocco" }, { code: "DZ", name: "Algeria" },
  { code: "TN", name: "Tunisia" }, { code: "JO", name: "Jordan" },
  { code: "LB", name: "Lebanon" }, { code: "IQ", name: "Iraq" },
  { code: "KW", name: "Kuwait" }, { code: "QA", name: "Qatar" },
  { code: "BH", name: "Bahrain" }, { code: "OM", name: "Oman" },
  { code: "BR", name: "Brazil" }, { code: "AR", name: "Argentina" },
  { code: "MX", name: "Mexico" }, { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" }, { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" }, { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" }, { code: "VN", name: "Vietnam" },
  { code: "TH", name: "Thailand" }, { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" }, { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" }, { code: "CN", name: "China" },
  { code: "TW", name: "Taiwan" }, { code: "HK", name: "Hong Kong" },
  { code: "AU", name: "Australia" }, { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" }, { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" }, { code: "GR", name: "Greece" },
  { code: "RO", name: "Romania" }, { code: "CZ", name: "Czechia" },
  { code: "AT", name: "Austria" }, { code: "CH", name: "Switzerland" },
  { code: "BE", name: "Belgium" }, { code: "IE", name: "Ireland" },
];

// Parse the admin-edited list from the CMS (falls back to the default roster).
export function parseCountries(raw: string | null | undefined): Country[] {
  if (!raw) return DEFAULT_COUNTRIES;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      const out = arr
        .filter((c) => c && typeof c.code === "string" && /^[A-Za-z]{2}$/.test(c.code))
        .map((c): Country => ({ code: String(c.code).toUpperCase(), name: String(c.name ?? c.code), emoji: typeof c.emoji === "string" && c.emoji ? c.emoji : undefined }));
      if (out.length) return out;
    }
  } catch { /* fall back */ }
  return DEFAULT_COUNTRIES;
}

export function countryName(countries: Country[], code?: string | null): string {
  if (!code) return "";
  return countries.find((c) => c.code === code.toUpperCase())?.name ?? code.toUpperCase();
}
