import { inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { brandCreativeIds, deliveryFor, MIN_COHORT, AUDIENCE_NOTE } from "@/lib/ad-delivery";
import AdDelivery from "@/components/AdDelivery";
import {
  Page, Section, StatRow, Stat, Table, Tr, Td, Note, Pill, num, AdminLink, LinkButton, Toolbar, Empty,
} from "@/components/admin/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Delivery" };

// What every brand's creatives actually delivered. B82, staff side.
//
// The numbers existed only inside a brand's own portal, which meant the one
// question staff get asked — "is this campaign delivering?" — could only be
// answered by opening somebody else's customer-facing page and reading it as
// though we were the customer. Worse, it meant nobody here saw the campaigns
// delivering NOTHING, because a brand with zero views does not log in to look
// at a zero.
//
// So: every brand, ordered by views, and the ones at zero are the top of the
// list rather than the bottom. A campaign live for a fortnight with no
// delivery is an operational failure — a missing creative, a paused placement,
// a bot that stopped posting — and it is invisible from every other screen.
//
// ===== THE THREE BOUNDS ARE THE SAME BOUNDS =====
//
// This page is staff-facing, and that changes NOTHING about what may be
// computed. It calls `deliveryFor`, the same function the portal calls, so:
// aggregate queries only, no identity in any row, and no percentage over a
// cohort under 25. A staff screen that reported a composition the brand's own
// screen suppresses would be a re-identification with an internal audience,
// which is still a re-identification.
//
// And the scoping still runs through `brandCreativeIds` → ids. `deliveryFor`
// takes creative ids and never a brand id, so there is no argument this page
// could pass that reaches the wrong brand's delivery.

/** How many days back the "recent" column looks. */
const RECENT_DAYS = 30;

export default async function AdminDeliveryPage({ searchParams }: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSystemFor("/admin/delivery");
  const db = await getDb();
  const focus = (await searchParams).brand ?? "";

  const brands = await db.select({
    id: schema.brands.id,
    name: schema.brands.name,
    slug: schema.brands.slug,
    status: schema.brands.status,
  }).from(schema.brands).orderBy(schema.brands.name);

  // One creative-id lookup per brand, then ONE grouped count over all of them.
  // Per-brand `deliveryFor` calls would be a query per brand on a page that
  // lists every brand — the shape of the defect B82 replaced.
  const creativeIdsBy = new Map<string, string[]>();
  for (const b of brands) creativeIdsBy.set(b.id, await brandCreativeIds(db, b.id));
  const allIds = [...creativeIdsBy.values()].flat();

  const since = new Date(Date.now() - RECENT_DAYS * 86400_000);
  const counted = allIds.length
    ? await db.select({
      id: schema.adImpressions.campaignCreativeId,
      views: sql<number>`count(*)`,
      recent: sql<number>`count(*) filter (where ${schema.adImpressions.createdAt} >= ${since})`,
    }).from(schema.adImpressions)
      .where(inArray(schema.adImpressions.campaignCreativeId, allIds))
      .groupBy(schema.adImpressions.campaignCreativeId)
    : [];
  const viewsBy = new Map(counted.map((r) => [String(r.id), { all: Number(r.views ?? 0), recent: Number(r.recent ?? 0) }]));

  const rows = brands.map((b) => {
    const ids = creativeIdsBy.get(b.id) ?? [];
    let views = 0, recent = 0;
    for (const id of ids) {
      const c = viewsBy.get(id);
      if (c) { views += c.all; recent += c.recent; }
    }
    return { ...b, creatives: ids.length, views, recent };
  });

  // Live but silent first. That is the row somebody has to act on today; a
  // brand delivering well needs nobody's attention.
  const silent = rows.filter((r) => r.status === "active" && r.creatives > 0 && r.recent === 0);
  const delivering = rows.filter((r) => !silent.includes(r)).sort((a, b) => b.views - a.views);

  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  const totalRecent = rows.reduce((s, r) => s + r.recent, 0);
  const withCreatives = rows.filter((r) => r.creatives > 0).length;

  // The focused brand gets the real panel — the identical component the brand
  // itself sees, deliberately, so staff and customer read one artefact. Two
  // renderings of one dataset is two things that can disagree in a meeting.
  const focused = focus ? rows.find((r) => r.id === focus) ?? null : null;
  const detail = focused
    ? await deliveryFor(db, creativeIdsBy.get(focused.id) ?? [])
    : null;

  return (
    <Page
      title="Delivery"
      lede={`What every brand's creatives actually delivered — one row per delivered card, counted, never estimated. This is the same data the brand sees in its own portal, from the same function, so there is no version of these numbers that only staff have.`}
      actions={
        <Toolbar>
          <LinkButton href="/admin/ads/analytics">Ad analytics</LinkButton>
          <LinkButton href="/admin/creatives">Creatives</LinkButton>
          <LinkButton href="/admin/brands">Brands</LinkButton>
        </Toolbar>
      }
    >
      <StatRow>
        <Stat
          label="Cards delivered"
          value={num(totalViews)}
          note="All time, across every brand. One delivered card, one row."
        />
        <Stat
          label={`Last ${RECENT_DAYS} days`}
          value={num(totalRecent)}
          note="The window that says whether anything is running now"
          tone={totalRecent === 0 && totalViews > 0 ? "warn" : "plain"}
        />
        <Stat
          label="Brands with creatives"
          value={num(withCreatives)}
          note={`of ${rows.length} on the platform`}
        />
        <Stat
          label="Live but silent"
          value={num(silent.length)}
          note="Active, has creatives, delivered nothing this month"
          tone={silent.length > 0 ? "bad" : "good"}
        />
      </StatRow>

      <Section
        title="Live but silent"
        note="An active brand with creatives loaded and nothing delivered in the last month. This is always an operational failure and never a quiet month: a placement paused, a creative never attached to a campaign, or the bot not posting where it was bought."
        empty="Nothing is silent. Every active brand with a creative has delivered something this month."
      >
        {silent.length > 0 ? (
          <Table
            cols={[
              { key: "brand", label: "Brand" },
              { key: "creatives", label: "Creatives", align: "right", secondary: true },
              { key: "all", label: "All time", align: "right" },
              { key: "look", label: "" },
            ]}
            empty="Nothing is silent."
          >
            {silent.map((r) => (
              <Tr key={r.id} tone="bad">
                <Td><AdminLink href={`/admin/brands/${r.id}`}>{r.name}</AdminLink></Td>
                <Td align="right" mono secondary>{num(r.creatives)}</Td>
                <Td align="right" mono bold>{num(r.views)}</Td>
                <Td><AdminLink href={`/admin/delivery?brand=${r.id}`}>Break it down</AdminLink></Td>
              </Tr>
            ))}
          </Table>
        ) : null}
      </Section>

      <Section title="Every brand" note="Ordered by what they have delivered, all time.">
        <Table
          cols={[
            { key: "brand", label: "Brand" },
            { key: "status", label: "Status", secondary: true },
            { key: "creatives", label: "Creatives", align: "right", secondary: true },
            { key: "recent", label: `Last ${RECENT_DAYS}d`, align: "right" },
            { key: "all", label: "All time", align: "right" },
            { key: "look", label: "" },
          ]}
          empty="No brand has been added yet, so nothing has been delivered for anybody."
        >
          {delivering.map((r) => (
            <Tr key={r.id}>
              <Td><AdminLink href={`/admin/brands/${r.id}`}>{r.name}</AdminLink></Td>
              <Td secondary>
                <Pill tone={r.status === "active" ? "good" : "plain"}>{r.status}</Pill>
              </Td>
              <Td align="right" mono secondary>{r.creatives ? num(r.creatives) : "none"}</Td>
              <Td align="right" mono>{num(r.recent)}</Td>
              <Td align="right" mono bold>{num(r.views)}</Td>
              <Td>
                {r.creatives > 0
                  ? <AdminLink href={`/admin/delivery?brand=${r.id}`}>Break it down</AdminLink>
                  : <span className="text-muted">—</span>}
              </Td>
            </Tr>
          ))}
        </Table>
      </Section>

      {focused && (
        <Section
          title={`${focused.name} — the brand's own view`}
          note="The identical panel the brand sees in its portal, rendered from the same function. Two renderings of one dataset is two things that can disagree in a meeting with the customer."
          actions={
            <Toolbar>
              <LinkButton href={`/brands/${focused.slug}`}>Open their portal</LinkButton>
              <LinkButton href="/admin/delivery">Clear</LinkButton>
            </Toolbar>
          }
        >
          {detail ? <AdDelivery delivery={detail} /> : <Empty>Nothing to break down for this brand yet.</Empty>}
        </Section>
      )}

      <Note tone="info">
        <b>Every figure here is a count of delivered cards.</b> A public post is never multiplied by a
        server&apos;s member count, and nothing is modelled or estimated — <code>docs/AD_VIEW.md</code> is the
        contract, and it is the same one the brand&apos;s portal implements.
      </Note>

      <Note tone="warn">
        <b>The privacy bounds apply here too, and are not relaxed for staff.</b> No query on this page
        selects a gamer&apos;s id, name or handle, and no composition is reported over fewer than{" "}
        {MIN_COHORT} viewers. A staff screen showing a breakdown the brand&apos;s own screen suppresses would
        still be a re-identification — an internal audience is still an audience. {AUDIENCE_NOTE}
      </Note>
    </Page>
  );
}
