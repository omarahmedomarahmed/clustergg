import { Page, Tabs, activeTab, type Tab } from "@/components/admin/kit";
import CopyPanel from "./CopyPanel";
import ChromePanel from "./ChromePanel";
import MobilePanel from "./MobilePanel";
import PartnersPanel from "./PartnersPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Site content" };

// Everything the public site SAYS, on one page.
//
// Four routes became four tabs: /admin/content, /admin/chrome, /admin/mobile
// and /admin/partners. They were all the same job — edit some text or some
// links the site shows — and three of them were under 60 lines, which is the
// tell: a route that small is a section somebody promoted to a page because
// there was nowhere else to put it.
//
// Only the active tab's panel renders, so its queries are the only ones that
// run. A merge that fetched all four would have made the page slower than the
// four pages it replaced.
const TABS: Tab[] = [
  { key: "copy", label: "Copy", desc: "Every headline, button label and background image on the public site. Empty field means the built-in default." },
  { key: "chrome", label: "Nav & footer", desc: "What appears in the top bar — set separately for signed-in and signed-out visitors — and every column and link in the footer." },
  { key: "mobile", label: "Mobile", desc: "The bottom tab bar and the burger drawer. Phones only. A blank tab label keeps its built-in translated name." },
  { key: "partners", label: "Partners", desc: "The logos in the homepage trusted-by strip." },
];

export default async function AdminContentPage({ searchParams }: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = activeTab(TABS, (await searchParams).tab).key;

  return (
    <Page
      title="Site content"
      lede="Everything the public site says, stored in the database and applied instantly — no deploy. Nothing here changes what the product DOES; it changes what it tells people."
    >
      <Tabs tabs={TABS} active={tab} base="/admin/content" />
      {tab === "copy" && <CopyPanel />}
      {tab === "chrome" && <ChromePanel />}
      {tab === "mobile" && <MobilePanel />}
      {tab === "partners" && <PartnersPanel />}
    </Page>
  );
}
