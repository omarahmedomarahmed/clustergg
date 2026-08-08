import { getContent } from "@/lib/cms";
import { NAV_SETTING_KEY, FOOTER_SETTING_KEY, parseNav, parseFooter } from "@/lib/site-chrome";
import SiteChromeEditor from "@/components/SiteChromeEditor";

// The Nav & footer tab. Was /admin/chrome, a 26-line route.
export default async function ChromePanel() {
  const c = await getContent([NAV_SETTING_KEY, FOOTER_SETTING_KEY]);
  return (
    <SiteChromeEditor
      initialNav={parseNav(c[NAV_SETTING_KEY])}
      initialFooter={parseFooter(c[FOOTER_SETTING_KEY])}
    />
  );
}
