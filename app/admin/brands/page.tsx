import { requireStaff } from "@/lib/auth";
import { Page, Tabs, activeTab, type Tab } from "@/components/admin/kit";
import DirectoryPanel from "./DirectoryPanel";
import EnquiriesPanel from "./EnquiriesPanel";
import TestimonialsPanel from "./TestimonialsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Brands" };

// One relationship, three views of it.
//
// /admin/brand-enquiries and /admin/brands/testimonials were separate routes,
// and the sequence they describe is a single one: somebody enquires, becomes a
// brand, runs a campaign, and a player says something worth printing in the
// report they get back. Splitting that across three pages meant the enquiry
// queue was somewhere you had to remember to look.
//
// The tabs are in that order deliberately.
const TABS: Tab[] = [
  { key: "brands", label: "Brands", desc: "Every brand on the platform. Open one for its campaigns, creatives, portal access and inbox." },
  { key: "enquiries", label: "Enquiries", desc: "Inbound from the form on /brands, carrying the plan the brand had configured when they sent it." },
  { key: "testimonials", label: "Testimonials", desc: "What players said after competing. These close the end-of-month report a brand receives, so nothing here is generated — a person asks, and a person types the answer." },
];

export default async function AdminBrandsPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  // Guarded here as well as in middleware and the layout. The Enquiries tab
  // holds names, emails and phone numbers people gave us to do business — it
  // does not get to rely on a check that lives in another file.
  await requireStaff();
  const sp = await searchParams;
  const tab = activeTab(TABS, sp.tab).key;

  return (
    <Page
      title="Brands"
      lede="Everybody who pays for a challenge, from the first enquiry to the quote we print in their report."
    >
      <Tabs tabs={TABS} active={tab} base="/admin/brands" />
      {tab === "brands" && <DirectoryPanel />}
      {tab === "enquiries" && <EnquiriesPanel status={sp.status} />}
      {tab === "testimonials" && <TestimonialsPanel />}
    </Page>
  );
}
