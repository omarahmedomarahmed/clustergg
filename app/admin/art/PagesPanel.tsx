import { getContent } from "@/lib/cms";
import { PAGE_BG_KEYS, pageBgCmsKeys } from "@/lib/page-bg";
import PageBackgroundsEditor from "@/components/PageBackgroundsEditor";
import { Section } from "@/components/admin/kit";

// The Page backgrounds tab of /admin/art. Was /admin/backgrounds.
export default async function PagesPanel() {
  const c = await getContent(pageBgCmsKeys);
  const current: Record<string, string> = {};
  for (const k of PAGE_BG_KEYS) current[k] = c[`page.bg.${k}`] || "";

  return (
    <Section
      title="Background per page"
      note="The art sits behind everything, under a dark veil so text stays readable. Leave a page empty to keep the default nebula. Images are cached in the browser after the first load."
    >
      <PageBackgroundsEditor current={current} />
    </Section>
  );
}
