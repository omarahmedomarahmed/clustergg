import { desc, eq } from "drizzle-orm";
import { requireSystemFor } from "@/lib/departments";
import { getDb, schema } from "@/lib/db";
import { openAlerts } from "@/lib/staff-alerts";
import { adminInbox } from "@/lib/threads";
import { listRequests } from "@/lib/challenge-requests";
import {
  Page, Section, StatRow, Stat, Table, Tr, Td, Note, Pill, AdminLink,
} from "@/components/admin/kit";
import ClearAlert from "@/components/admin/ClearAlert";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Support desk" };

// One screen for the people who look after servers and gamers. B91.11.
//
// The mirror of the sales desk, and the split between them is by WHO IS
// WAITING rather than by feature: a server owner who asked for a challenge and
// a gamer whose trophy will not redeem are the same job — somebody outside is
// blocked on us — while a brand's unpaid invoice is a different one.
//
// Composes existing pages, edits nothing.

export default async function SupportDeskPage() {
  await requireSystemFor("/admin/support");
  const db = await getDb();

  const [alerts, inbox, requests, unfinished] = await Promise.all([
    openAlerts(db, "ops", 40),
    adminInbox(),
    listRequests({ status: "pending" }),
    // Challenges somebody has PAID for that we have not finished setting up.
    // Every one of these is a community waiting on us, and they are invisible
    // on the challenges list among a hundred drafts.
    db.select({
      id: schema.challenges.id,
      title: schema.challenges.title,
      guildId: schema.challenges.guildId,
      startAt: schema.challenges.startAt,
    }).from(schema.challenges)
      .where(eq(schema.challenges.status, "draft"))
      .orderBy(desc(schema.challenges.createdAt))
      .limit(40),
  ]);

  const serverThreads = inbox.filter((t) => t.kind === "server");
  const waiting = serverThreads.filter((t) => t.unread > 0);
  const privateDrafts = unfinished.filter((c) => !!c.guildId);

  return (
    <Page
      title="Support desk"
      lede="Servers and gamers who are blocked on us. Every row is somebody outside waiting — the split from the sales desk is by who is waiting, not by feature."
    >
      <StatRow>
        <Stat label="Waiting on you" value={String(alerts.length)} note="Things that happened and nobody has picked up" tone={alerts.length ? "warn" : "good"} />
        <Stat label="Unanswered" value={String(waiting.length)} note="Server owners waiting on a reply" tone={waiting.length ? "warn" : "good"} />
        <Stat label="Challenge requests" value={String(requests.length)} note="Owners who asked for a competition" tone={requests.length ? "warn" : "good"} />
        <Stat label="Unfinished drafts" value={String(privateDrafts.length)} note="Belong to a server and are not set up yet" />
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

      <Section title="Servers waiting on a reply" note="Counted per server, not per message — one owner asking three things is one conversation.">
        <Table cols={[{ key: "s", label: "Server" }, { key: "last", label: "Last message", secondary: true }, { key: "u", label: "", align: "right" }]} empty="Nobody is waiting.">
          {serverThreads.map((t) => (
            <Tr key={t.id}>
              <Td><AdminLink href={t.href}>{t.name}</AdminLink></Td>
              <Td secondary>{t.lastBody.slice(0, 90)}</Td>
              <Td align="right">{t.unread > 0 ? <Pill tone="warn">{t.unread} unread</Pill> : <span className="text-xs text-muted">answered</span>}</Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Challenges asked for"
        note="An owner asked for a competition. Approving one opens it in the editor — it does not put it live."
      >
        <Table cols={[{ key: "t", label: "What they asked for" }, { key: "g", label: "Game", align: "right" }]} empty="Nothing pending.">
          {requests.map((r) => (
            <Tr key={r.id}>
              <Td><AdminLink href="/admin/discord/requests">{r.title}</AdminLink></Td>
              <Td align="right" secondary>{r.game}</Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Bought and not set up"
        note="A challenge that belongs to a server and is still a draft. Somebody paid for one of these and their members are waiting."
      >
        <Table cols={[{ key: "t", label: "Challenge" }, { key: "s", label: "Starts", align: "right" }]} empty="Nothing unfinished.">
          {privateDrafts.slice(0, 20).map((c) => (
            <Tr key={c.id}>
              <Td><AdminLink href={`/admin/challenges/${c.id}`}>{c.title}</AdminLink></Td>
              <Td align="right" secondary>{c.startAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Note tone="info">
        Trophy redemptions and stuck prize money live on their own screens because they move money —
        <AdminLink href="/admin/redeems"> redemptions</AdminLink> and
        <AdminLink href="/admin/stuck"> stuck money</AdminLink>. This page is for people waiting on an
        answer, not for payments.
      </Note>
    </Page>
  );
}
