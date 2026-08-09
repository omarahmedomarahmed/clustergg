import { requireSystemFor } from "@/lib/departments";
import { getDb } from "@/lib/db";
import { openAlerts, DESKS, type Desk } from "@/lib/staff-alerts";
import { Page, Section, Table, Tr, Td, Note, AdminLink } from "@/components/admin/kit";
import { listDrafts } from "@/lib/form-drafts";
import ClearAlert from "@/components/admin/ClearAlert";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · What needs you" };

// The desk. B91.4.
//
// Everything a CUSTOMER did that somebody here should react to, grouped by who
// reacts to it. Not the audit log — that records what staff did, for the
// question "who authorised this". This answers a different question with a
// different clock: is anybody on it.
//
// A brand that signs up at 2am, builds a campaign, and hears nothing for four
// days was failed long before anybody thinks to read a log. That is the whole
// reason this page exists, and it is why an alert can be CLEARED by a named
// person: a list nobody can empty is one people stop opening.

const DESK_ORDER: Desk[] = ["sales", "ops", "money"];

export default async function AlertsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSystemFor("/admin/alerts");
  const sp = await searchParams;
  const only = (Array.isArray(sp.desk) ? sp.desk[0] : sp.desk) as Desk | undefined;
  const db = await getDb();
  const rows = await openAlerts(db, DESK_ORDER.includes(only as Desk) ? only : undefined, 120);
  // B91.8. A half-built campaign is a SALES LIST, not a debugging tool:
  // somebody who was trying to buy something and stopped, which is worth a call
  // the same day rather than a report at the end of the month.
  const drafts = await listDrafts(db, undefined, 40);

  return (
    <Page
      title="What needs you"
      lede="Everything a brand, a server owner or a gamer just did that somebody here should react to. Clearing one puts your name on it — this is a worklist, not a feed."
    >
      <div className="flex flex-wrap gap-2">
        <AdminLink href="/admin/alerts">All desks</AdminLink>
        {DESK_ORDER.map((d) => (
          <AdminLink key={d} href={`/admin/alerts?desk=${d}`}>{DESKS[d].label}</AdminLink>
        ))}
      </div>

      {DESK_ORDER.filter((d) => !only || d === only).map((desk) => {
        const mine = rows.filter((r) => r.desk === desk);
        return (
          <Section key={desk} title={DESKS[desk].label} note={DESKS[desk].blurb}>
            <Table
              cols={[
                { key: "what", label: "What happened" },
                { key: "when", label: "When", align: "right" },
                { key: "do", label: "", align: "right" },
              ]}
              empty="Nothing waiting on this desk."
            >
              {mine.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <div className="font-semibold">
                      {a.href ? <AdminLink href={a.href}>{a.title}</AdminLink> : a.title}
                    </div>
                    {a.body && <div className="text-xs text-muted">{a.body}</div>}
                  </Td>
                  <Td align="right" secondary>
                    {a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" "}
                    {a.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </Td>
                  <Td align="right"><ClearAlert id={a.id} /></Td>
                </Tr>
              ))}
            </Table>
          </Section>
        );
      })}

      {(!only || only === "sales") && (
        <Section
          title="Half-built, and still open"
          note="Somebody started building something and did not finish. Nothing here is a bug — it is a list of people who were trying to buy and stopped, with what they had on screen when they did."
        >
          <Table
            cols={[
              { key: "who", label: "Who" },
              { key: "what", label: "What they were building" },
              { key: "when", label: "Last touched", align: "right" },
            ]}
            empty="Nobody has anything half-built."
          >
            {drafts.map((d) => (
              <Tr key={`${d.ownerType}-${d.ownerId}-${d.formKey}`}>
                <Td>
                  <span className="text-[10px] uppercase tracking-widest text-muted">{d.ownerType}</span>{" "}
                  {d.ownerType === "brand"
                    ? <AdminLink href={`/admin/brands/${d.ownerId}`}>{d.ownerId}</AdminLink>
                    : d.ownerType === "server"
                      ? <AdminLink href={`/admin/discord/${d.ownerId}`}>{d.ownerId}</AdminLink>
                      : d.ownerId}
                </Td>
                <Td>{d.label || d.formKey}</Td>
                <Td align="right" secondary>
                  {d.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Td>
              </Tr>
            ))}
          </Table>
        </Section>
      )}

      <Note tone="info">
        This is not the audit log. That records what <b>we</b> did, for the question &ldquo;who
        authorised this&rdquo;. This records what <b>customers</b> did, for the question &ldquo;is
        anybody on it&rdquo; — and the answer has a clock on it.
      </Note>
    </Page>
  );
}
