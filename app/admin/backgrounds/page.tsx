import { getContent } from "@/lib/cms";
import { PAGE_BG_KEYS, pageBgCmsKeys } from "@/lib/page-bg";
import PageBackgroundsEditor from "@/components/PageBackgroundsEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Page backgrounds" };

export default async function AdminBackgroundsPage() {
  const c = await getContent(pageBgCmsKeys);
  const current: Record<string, string> = {};
  for (const k of PAGE_BG_KEYS) current[k] = c[`page.bg.${k}`] || "";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Page backgrounds</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Set a custom space background for any page. It sits behind everything, under a dark veil
        so text stays readable. Leave a page empty to keep the default nebula. Images are cached
        in the browser after the first load.
      </p>
      <div className="glass p-6">
        <h2 className="font-bold mb-4 flex items-center gap-2"><Icon name="monitor" size={16} className="text-cyan-300" /> Background per page</h2>
        <PageBackgroundsEditor current={current} />
      </div>
    </div>
  );
}
