import { requireStaff } from "@/lib/auth";
import { Page, Tabs, activeTab, type Tab } from "@/components/admin/kit";
import PagesPanel from "./PagesPanel";
import CardsPanel from "./CardsPanel";
import LayoutsPanel from "./LayoutsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Art" };

// Every surface's artwork, in one place.
//
// Three routes became three tabs: /admin/backgrounds, /admin/cards and
// /admin/cards/guide. All three answered "what art goes on this surface", the
// first two were 26 lines each, and the third opened with a back-link to the
// second — which is a tab bar somebody had already written by hand.
//
// The order is the order the work happens in: pick the art, then decide where
// the words land on it.
const TABS: Tab[] = [
  { key: "pages", label: "Page backgrounds", desc: "The space background behind a whole page on the site." },
  { key: "cards", label: "Card backgrounds", desc: "The art behind every card we render, including the ones the bot posts to Discord." },
  { key: "layouts", label: "Card layouts", desc: "Where the mascot, logo, badge and text land on each kind of card. A layout applies to the KIND, everywhere it is rendered." },
];

export default async function AdminArtPage({ searchParams }: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // The card studio loads a lot: every layout, the brand art, the asset library,
  // the button copy and several real samples per card kind. Kept behind its own
  // tab so opening "page backgrounds" does not pay for it.
  await requireStaff();
  const tab = activeTab(TABS, (await searchParams).tab).key;

  return (
    <Page
      title="Art"
      lede="The artwork behind every surface — site pages, and every card we render. Nothing here changes what a card says; it changes what it looks like."
    >
      <Tabs tabs={TABS} active={tab} base="/admin/art" />
      {tab === "pages" && <PagesPanel />}
      {tab === "cards" && <CardsPanel />}
      {tab === "layouts" && <LayoutsPanel />}
    </Page>
  );
}
