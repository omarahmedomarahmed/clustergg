import { getRawContent } from "@/lib/cms";
import { STRINGS, STRING_KEYS, PAGE_STRINGS, AR_TEXT } from "@/lib/i18n/strings";
import UiStringsEditor, { type UiGroup } from "@/components/UiStringsEditor";

// The Interface tab of /admin/language: every fixed string the product itself
// says, in both languages.
//
// A string only appears here if it is registered in lib/i18n/strings. An
// unregistered string still RENDERS — `tr()` falls back to the English it was
// given — so a missing entry is invisible from the product and visible only as
// a gap in this list. That is why the list is grouped by page rather than
// alphabetically: a page with two rows is a page somebody forgot.
export default async function InterfacePanel() {
  const raw = await getRawContent(["ui.overrides.en", "ui.overrides.ar"], "en");
  const parse = (s?: string) => {
    try { const j = JSON.parse(s || "{}"); return j && typeof j === "object" ? j as Record<string, string> : {}; }
    catch { return {}; }
  };
  const enOv = parse(raw["ui.overrides.en"]);
  const arOv = parse(raw["ui.overrides.ar"]);

  const groups: UiGroup[] = [
    {
      page: "Chrome (nav, footer, buttons)",
      items: STRING_KEYS.map((k) => ({ key: k, en: enOv[k] ?? STRINGS.en[k], ar: arOv[k] ?? STRINGS.ar[k] })),
    },
    ...PAGE_STRINGS.map((g) => ({
      page: g.page,
      items: g.strings.map((s) => ({ key: s, en: enOv[s] ?? s, ar: arOv[s] ?? AR_TEXT[s] ?? "" })),
    })),
  ];

  return <UiStringsEditor groups={groups} />;
}
