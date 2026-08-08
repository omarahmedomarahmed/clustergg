import { getCountries } from "@/lib/countries-server";
import CountriesEditor from "@/components/CountriesEditor";

// The Countries tab of /admin/language. The flag list is here rather than on a
// settings page because the flag toggle in the nav is how a gamer changes
// language — the two are one control to everybody except us.
export default async function CountriesPanel() {
  return <CountriesEditor initial={await getCountries()} />;
}
