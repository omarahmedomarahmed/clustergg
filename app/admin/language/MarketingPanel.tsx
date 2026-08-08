import { getContent, getRawContent } from "@/lib/cms";
import ArabicContentEditor, { type ArabicItem } from "@/components/ArabicContentEditor";

// The Marketing tab of /admin/language: the Arabic side of the CMS copy.
//
// Only text lives here — no URLs, no colours. A field that is a link translated
// into Arabic is a broken link, so the list is deliberately hand-picked rather
// than "every CMS key".
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

export default async function MarketingPanel() {
  const keys = TRANSLATABLE.map((t) => t.key);
  const [en, ar] = await Promise.all([getContent(keys, "en"), getRawContent(keys, "ar")]);
  const items: ArabicItem[] = TRANSLATABLE.map((t) => ({
    key: t.key, label: t.label, en: en[t.key] ?? "", ar: ar[t.key] ?? "", multiline: t.multiline,
  }));

  return (
    <ArabicContentEditor
      items={items}
      title="Marketing copy (Arabic)"
      subtitle="Translate the homepage and section copy. The English side is edited on Site content — this page never overwrites it."
    />
  );
}
