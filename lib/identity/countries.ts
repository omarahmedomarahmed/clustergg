// The country picker, and the countries that are never in it.
//
// G11: **sanctioned countries are not offered in the country picker at all.**
// Not greyed out, not offered-then-refused. Absent. A picker that lists a
// country and then refuses it has told somebody they might be eligible and
// then taken it back; a picker that never listed it never made the promise.
//
// The list is a *default*. Admin can edit it (G11), and when Stage 9 builds
// that screen it writes to `settings` and this module reads it — the code-side
// value here is what the platform falls back to, exactly as content rule C3
// describes for copy.
//
// Names are not typed out. `Intl.DisplayNames` already holds every one of them
// and is kept current by ICU; a hand-typed list of 249 country names is 249
// chances to spell one wrong and a guaranteed drift the first time a country
// changes its name.

/** ISO 3166-1 alpha-2, every assigned code. */
const CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ " +
  "BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR " +
  "CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU " +
  "ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ " +
  "LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ " +
  "MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF " +
  "PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI " +
  "SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR " +
  "TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

/**
 * Comprehensively sanctioned jurisdictions — the default, which admin edits.
 *
 * These are the jurisdictions under comprehensive (whole-country) programmes,
 * not the much longer list of countries with *some* targeted measures. The
 * distinction matters: a targeted programme names people, and screening people
 * is not the same job as removing a country from a dropdown.
 *
 * This default is deliberately conservative and deliberately editable. It is
 * not legal advice and it is not a compliance decision — it is a starting
 * value that a human reviews on the admin screen. That review is the control;
 * this constant is only the thing it starts from.
 */
export const DEFAULT_SANCTIONED = ["CU", "IR", "KP", "SY"] as const;

export type Country = { code: string; name: string };

const names = new Intl.DisplayNames(["en"], { type: "region" });

/** Every assigned country code with its English name, sorted by name. */
export function allCountries(): Country[] {
  return CODES.split(" ")
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/**
 * What the picker shows: every country except the sanctioned ones.
 *
 * `sanctioned` is passed in rather than read from a module global so the admin
 * screen's edited list and the code-side default flow through the same
 * function. There is no second implementation of "which countries are shown".
 */
export function offeredCountries(
  sanctioned: readonly string[] = DEFAULT_SANCTIONED,
): Country[] {
  const blocked = new Set(sanctioned.map((c) => c.toUpperCase()));
  return allCountries().filter((c) => !blocked.has(c.code));
}

/**
 * Whether a country may be accepted at all.
 *
 * Checked at the action, not only at the picker. A dropdown is a suggestion;
 * a form post is whatever the poster wanted it to be.
 */
export function isCountryAllowed(
  code: string | null | undefined,
  sanctioned: readonly string[] = DEFAULT_SANCTIONED,
): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  if (!CODES.split(" ").includes(upper)) return false;
  return !sanctioned.map((c) => c.toUpperCase()).includes(upper);
}

export function countryName(code: string): string {
  return names.of(code.toUpperCase()) ?? code.toUpperCase();
}
