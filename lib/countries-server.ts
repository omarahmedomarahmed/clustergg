import { getContent } from "@/lib/cms";
import { parseCountries, type Country } from "@/lib/flags";

// The admin-editable roster of countries gamers can pick a flag from. Reads the
// CMS override (Admin → Site content → Countries) and falls back to the default.
export async function getCountries(): Promise<Country[]> {
  const raw = (await getContent(["profile.countries"]))["profile.countries"];
  return parseCountries(raw);
}
