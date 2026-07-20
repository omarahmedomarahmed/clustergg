import { getContent, getRawContent } from "@/lib/cms";
import { getCountries } from "@/lib/countries-server";
import { STRINGS, STRING_KEYS, PAGE_STRINGS, AR_TEXT } from "@/lib/i18n/strings";
import CountriesEditor from "@/components/CountriesEditor";
import ArabicContentEditor, { type ArabicItem } from "@/components/ArabicContentEditor";
import UiStringsEditor, { type UiGroup } from "@/components/UiStringsEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Language & flags" };

// Marketing / CMS copy keys (translatable text, not URLs/colours).
const TRANSLATABLE: { key: string; label: string; multiline?: boolean }[] = [
  { key: "hero.badge", label: "Hero · badge" },
  { key: "hero.title.line1", label: "Hero · title line 1" },
  { key: "hero.title.line2", label: "Hero · title line 2" },
  { key: "hero.subtitle", label: "Hero · subtitle", multiline: true },
  { key: "hero.cta.primary", label: "Hero · primary button" },
  { key: "hero.cta.secondary", label: "Hero · secondary button" },
  { key: "section.challenges.title", label: "Challenges · title" },
  { key: "section.challenges.subtitle", label: "Challenges · subtitle", multiline: true },
  { key: "section.games.title", label: "Games · title" },
  { key: "section.games.subtitle", label: "Games · subtitle", multiline: true },
  { key: "section.leaderboards.title", label: "Leaderboards · title" },
  { key: "section.leaderboards.subtitle", label: "Leaderboards · subtitle", multiline: true },
  { key: "section.badges.title", label: "Badges · title" },
  { key: "section.badges.subtitle", label: "Badges · subtitle", multiline: true },
  { key: "section.partners.title", label: "Partners · title" },
  { key: "section.cta.title", label: "CTA · title" },
  { key: "section.cta.subtitle", label: "CTA · subtitle", multiline: true },
  { key: "section.cta.button", label: "CTA · button" },
  { key: "footer.tagline", label: "Footer · tagline", multiline: true },
  { key: "brand.loading.phrases", label: "Loading screen · phrases (one per line)", multiline: true },
];

export default async function LanguageAdminPage() {
  const keys = TRANSLATABLE.map((t) => t.key);
  const [countries, en, ar, uiRaw] = await Promise.all([
    getCountries(),
    getContent(keys, "en"),
    getRawContent(keys, "ar"),
    getRawContent(["ui.overrides.en", "ui.overrides.ar"], "en"),
  ]);
  const items: ArabicItem[] = TRANSLATABLE.map((t) => ({ key: t.key, label: t.label, en: en[t.key] ?? "", ar: ar[t.key] ?? "", multiline: t.multiline }));

  // Current per-locale UI overrides.
  const parse = (s?: string) => { try { const j = JSON.parse(s || "{}"); return j && typeof j === "object" ? j as Record<string, string> : {}; } catch { return {}; } };
  const enOv = parse(uiRaw["ui.overrides.en"]);
  const arOv = parse(uiRaw["ui.overrides.ar"]);

  const uiGroups: UiGroup[] = [
    {
      page: "Chrome (nav, footer, buttons)",
      items: STRING_KEYS.map((k) => ({ key: k, en: enOv[k] ?? STRINGS.en[k], ar: arOv[k] ?? STRINGS.ar[k] })),
    },
    ...PAGE_STRINGS.map((g) => ({
      page: g.page,
      items: g.strings.map((s) => ({ key: s, en: enOv[s] ?? s, ar: arOv[s] ?? AR_TEXT[s] ?? "" })),
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Icon name="globe" size={20} className="text-cyan-300" /> Language &amp; flags</h1>
        <p className="text-sm text-muted mt-1">
          Edit every word on every page in English and Arabic, translate the marketing copy, and manage the country flags.
          Gamers switch language with the 🇪🇬/🇺🇸 toggle in the nav. Roadmap: <span className="font-mono text-[12px]">docs/arabic-localization-plan.md</span>.
        </p>
      </div>
      <UiStringsEditor groups={uiGroups} />
      <ArabicContentEditor items={items} title="Marketing copy (Arabic)" subtitle="Translate the homepage / section copy. English is edited on the Site content page." />
      <CountriesEditor initial={countries} />
    </div>
  );
}
