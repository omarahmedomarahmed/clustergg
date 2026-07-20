import { getContent, getRawContent } from "@/lib/cms";
import { getCountries } from "@/lib/countries-server";
import CountriesEditor from "@/components/CountriesEditor";
import ArabicContentEditor, { type ArabicItem } from "@/components/ArabicContentEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Language & flags" };

// The site-copy keys worth translating (text, not URLs/colours), with labels.
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
  const [countries, en, ar] = await Promise.all([
    getCountries(),
    getContent(keys, "en"),
    getRawContent(keys, "ar"),
  ]);
  const items: ArabicItem[] = TRANSLATABLE.map((t) => ({ key: t.key, label: t.label, en: en[t.key] ?? "", ar: ar[t.key] ?? "", multiline: t.multiline }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Icon name="globe" size={20} className="text-cyan-300" /> Language &amp; flags</h1>
        <p className="text-sm text-muted mt-1">
          Translate the site into Arabic (gamers switch with the 🇪🇬/🇺🇸 toggle in the nav) and manage the country flags they can pick.
          The full localization roadmap lives in <span className="font-mono text-[12px]">docs/arabic-localization-plan.md</span>.
        </p>
      </div>
      <ArabicContentEditor items={items} />
      <CountriesEditor initial={countries} />
    </div>
  );
}
