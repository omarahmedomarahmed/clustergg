import { Page, Tabs, activeTab, type Tab } from "@/components/admin/kit";
import InterfacePanel from "./InterfacePanel";
import MarketingPanel from "./MarketingPanel";
import EntitiesPanel from "./EntitiesPanel";
import CountriesPanel from "./CountriesPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Language" };

// Everything the platform says, in every language it says it in.
//
// Two routes became one: /admin/language stacked three large editors down a
// single column, and /admin/translations was a fourth editor on its own page.
// Nobody uses one without the other — the split ran between "strings we wrote"
// and "strings the database holds", which is our distinction, not a
// translator's.
//
// The four tabs are the four KINDS of translatable text, and they are ordered
// by how much of the product each one covers.
const TABS: Tab[] = [
  { key: "interface", label: "Interface", desc: "Every fixed string the product says — nav, buttons, empty states, every page. English and Arabic side by side." },
  { key: "marketing", label: "Marketing copy", desc: "The Arabic side of the CMS copy. English is edited on Site content." },
  { key: "content", label: "Content", desc: "Quests, milestones, game planets, challenges and leaderboards — the text that lives in the database. Blank Arabic falls back to English." },
  { key: "countries", label: "Countries & flags", desc: "The flag list. The flag toggle in the nav is how a gamer switches language, so the two belong together." },
];

export default async function AdminLanguagePage({ searchParams }: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = activeTab(TABS, (await searchParams).tab).key;

  return (
    <Page
      title="Language"
      lede="Every word the platform says, in English and Arabic. A blank Arabic value is not an error — it falls back to English, so a half-translated product is a working product."
    >
      <Tabs tabs={TABS} active={tab} base="/admin/language" />
      {tab === "interface" && <InterfacePanel />}
      {tab === "marketing" && <MarketingPanel />}
      {tab === "content" && <EntitiesPanel />}
      {tab === "countries" && <CountriesPanel />}
    </Page>
  );
}
