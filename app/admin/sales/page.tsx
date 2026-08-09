import { desc, eq, ne, sql } from "drizzle-orm";
import { requireSystemFor } from "@/lib/departments";
import { getDb, schema } from "@/lib/db";
import { openAlerts } from "@/lib/staff-alerts";
import { listDrafts } from "@/lib/form-drafts";
import { adminInbox } from "@/lib/threads";
import { listEnquiries } from "@/lib/brand-enquiries";
import {
  Page, Section, StatRow, Stat, Table, Tr, Td, Money, Note, Pill, AdminLink,
} from "@/components/admin/kit";
import ClearAlert from "@/components/admin/ClearAlert";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Sales desk" };

// One screen for the people who talk to brands. B91.11.
//
// Everything a salesperson needs was already in the product and spread across
// six pages: alerts on one, enquiries on another, drafts on a third, unpaid
// invoices on a fourth, the conversation itself on a fifth. Nobody works that
// way — a desk opens one page at the start of a shift and works down it.
//
// So this composes, it does not duplicate. Every row links to the page that
// owns the thing, and nothing here is editable: the desk is a worklist, and a
// worklist that can also change money is a worklist somebody edits by accident.

export default async function SalesDeskPage() {
  await requireSystemFor("/admin/sales");
  const db = await getDb();

  const [alerts, drafts, inbox, enquiries, unpaid, pendingBrands] = await Promise.all([
    openAlerts(db, "sales", 40),
    listDrafts(db, "brand", 25),
    adminInbox(),
    listEnquiries(undefined, 25),
    db.select({
      id: schema.brandInvoices.id,
      number: schema.brandInvoices.number,
      brandId: schema.brandInvoices.brandId,
      status: schema.brandInvoices.status,
      dueAt: schema.brandInvoices.dueAt,
      total: sql<number>`coalesce(sum(${schema.invoiceLines.quantity} * ${schema.invoiceLines.unitAmount}), 0)`,
    }).from(schema.brandInvoices)
      .leftJoin(schema.invoiceLines, eq(schema.invoiceLines.invoiceId, schema.brandInvoices.id))
      .where(ne(schema.brandInvoices.status, "paid"))
      .groupBy(schema.brandInvoices.id, schema.brandInvoices.number, schema.brandInvoices.brandId,
        schema.brandInvoices.status, schema.brandInvoices.dueAt)
      .orderBy(desc(schema.brandInvoices.issuedAt))
      .limit(20),
    db.select({ id: schema.brands.id, name: schema.brands.name, at: schema.brands.createdAt })
      .from(schema.brands).where(eq(schema.brands.status, "pending"))
      .orderBy(desc(schema.brands.createdAt)).limit(20),
  ]);

  const brandThreads = inbox.filter((t) => t.kind === "brand");
  const owed = unpaid.reduce((a, i) => a + Number(i.total ?? 0), 0);

  return (
    <Page
      title="Sales desk"
      lede="Everything a brand did that somebody here should answer, and everything they owe. Nothing on this page changes anything — each row links to the screen that owns it."
    >
      <StatRow>
        <Stat label="Waiting on you" value={String(alerts.length)} note="Things that happened and nobody has picked up" tone={alerts.length ? "warn" : "good"} />
        <Stat label="Half-built" value={String(drafts.length)} note="Brands who started buying and stopped" />
        <Stat label="Unanswered" value={String(brandThreads.filter((t) => t.unread > 0).length)} note="Brands waiting on a reply" tone={brandThreads.some((t) => t.unread) ? "warn" : "good"} />
        <Stat label="Invoiced, not paid" value={owed.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} note="Nothing announces until it clears" />
      </StatRow>

      <Section title="Needs picking up" note="Clearing one puts your name on it.">
        <Table
          cols={[{ key: "what", label: "What happened" }, { key: "when", label: "When", align: "right" }, { key: "do", label: "", align: "right" }]}
          empty="Nothing waiting."
        >
          {alerts.map((a) => (
            <Tr key={a.id}>
              <Td>
                <div className="font-semibold">{a.href ? <AdminLink href={a.href}>{a.title}</AdminLink> : a.title}</div>
                {a.body && <div className="text-xs text-muted">{a.body}</div>}
              </Td>
              <Td align="right" secondary>{a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Td>
              <Td align="right"><ClearAlert id={a.id} /></Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Waiting to be approved"
        note="Brands that signed themselves up. Nothing of theirs serves anywhere until somebody here looks at the account."
      >
        <Table cols={[{ key: "brand", label: "Brand" }, { key: "when", label: "Signed up", align: "right" }]} empty="Nobody waiting.">
          {pendingBrands.map((b) => (
            <Tr key={b.id}>
              <Td><AdminLink href={`/admin/brands/${b.id}`}>{b.name}</AdminLink></Td>
              <Td align="right" secondary>{b.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Started buying and stopped"
        note="A half-built campaign is somebody who was trying to give us money and got interrupted. Worth a call the same day."
      >
        <Table cols={[{ key: "brand", label: "Brand" }, { key: "what", label: "What" }, { key: "when", label: "Last touched", align: "right" }]} empty="Nothing half-built.">
          {drafts.map((d) => (
            <Tr key={`${d.ownerId}-${d.formKey}`}>
              <Td><AdminLink href={`/admin/brands/${d.ownerId}`}>{d.ownerId}</AdminLink></Td>
              <Td>{d.label || d.formKey}</Td>
              <Td align="right" secondary>{d.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section title="Conversations" note="Every brand thread, unanswered first.">
        <Table cols={[{ key: "brand", label: "Brand" }, { key: "last", label: "Last message", secondary: true }, { key: "u", label: "", align: "right" }]} empty="No brand has written.">
          {brandThreads.map((t) => (
            <Tr key={t.id}>
              <Td><AdminLink href={t.href}>{t.name}</AdminLink></Td>
              <Td secondary>{t.lastBody.slice(0, 90)}</Td>
              <Td align="right">{t.unread > 0 ? <Pill tone="warn">{t.unread} unread</Pill> : <span className="text-xs text-muted">answered</span>}</Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section title="Invoiced and not paid" note="A campaign cannot be announced until its invoice clears — this list is what is holding work up.">
        <Table
          cols={[{ key: "n", label: "Invoice" }, { key: "amt", label: "Amount", align: "right" }, { key: "s", label: "Status", align: "right" }]}
          empty="Everything is paid."
        >
          {unpaid.map((i) => (
            <Tr key={i.id}>
              <Td><AdminLink href={`/admin/billing?invoice=${i.id}`}>{i.number}</AdminLink></Td>
              <Td align="right" mono><Money value={Number(i.total ?? 0)} /></Td>
              <Td align="right"><Pill tone={i.status === "overdue" ? "bad" : "warn"}>{i.status}</Pill></Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section title="Enquiries" note="People who asked to talk rather than signing up.">
        <Table cols={[{ key: "co", label: "Company" }, { key: "s", label: "Status", align: "right" }]} empty="No enquiries.">
          {enquiries.slice(0, 12).map((e) => (
            <Tr key={e.id}>
              <Td><AdminLink href="/admin/brands?tab=enquiries">{e.company}</AdminLink></Td>
              <Td align="right"><Pill tone={e.status === "new" ? "warn" : "good"}>{e.status}</Pill></Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Note tone="info">
        Nothing here edits anything. A worklist that can also move money is one somebody edits by
        accident — every row links to the screen that owns the thing.
      </Note>
    </Page>
  );
}
