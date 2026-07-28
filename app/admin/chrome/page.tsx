import Icon from "@/components/Icon";
import { getContent } from "@/lib/cms";
import { NAV_SETTING_KEY, FOOTER_SETTING_KEY, parseNav, parseFooter } from "@/lib/site-chrome";
import SiteChromeEditor from "@/components/SiteChromeEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Nav & footer" };

export default async function AdminChromePage() {
  const c = await getContent([NAV_SETTING_KEY, FOOTER_SETTING_KEY]);
  return (
    <div>
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold">
        <Icon name="grid" size={20} className="text-cyan-300" /> Nav &amp; footer
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        What appears in the top bar, set separately for people who are signed in and people who
        aren&apos;t — and every column and link in the footer. Changes apply to every page.
      </p>
      <SiteChromeEditor
        initialNav={parseNav(c[NAV_SETTING_KEY])}
        initialFooter={parseFooter(c[FOOTER_SETTING_KEY])}
      />
    </div>
  );
}
