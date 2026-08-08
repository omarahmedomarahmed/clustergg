import { getContent } from "@/lib/cms";
import { parseBottomTabs, parseDrawerLinks, defaultBottomTabs } from "@/lib/mobile-nav";
import MobileChromeEditor from "@/components/MobileChromeEditor";

// The Mobile tab. Was /admin/mobile, a 27-line route.
export default async function MobilePanel() {
  const c = await getContent(["mobile.bottomnav", "mobile.drawer.extra"]);
  const bottom = parseBottomTabs(c["mobile.bottomnav"]) ?? defaultBottomTabs(true);
  const drawer = parseDrawerLinks(c["mobile.drawer.extra"]);
  return <MobileChromeEditor initialBottom={bottom} initialDrawer={drawer} />;
}
