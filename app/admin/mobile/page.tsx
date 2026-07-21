import { getContent } from "@/lib/cms";
import { parseBottomTabs, parseDrawerLinks, defaultBottomTabs } from "@/lib/mobile-nav";
import MobileChromeEditor from "@/components/MobileChromeEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Mobile chrome" };

export default async function AdminMobileChromePage() {
  const c = await getContent(["mobile.bottomnav", "mobile.drawer.extra"]);
  const bottom = parseBottomTabs(c["mobile.bottomnav"]) ?? defaultBottomTabs(true);
  const drawer = parseDrawerLinks(c["mobile.drawer.extra"]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Icon name="planet" size={20} className="text-cyan-300" /> Mobile chrome
      </h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Control the native mobile navigation — the bottom tab bar and the extra links in
        the burger side drawer. These only show on phones. Leave a bottom tab&apos;s label
        blank to keep its built-in translated name, and mark one tab as the raised centre.
      </p>
      <MobileChromeEditor initialBottom={bottom} initialDrawer={drawer} />
    </div>
  );
}
