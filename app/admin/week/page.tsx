import { and, desc, eq, sql } from "drizzle-orm";
import { requireSystemFor } from "@/lib/departments";
import { getDb, schema } from "@/lib/db";
import { balances } from "@/lib/vaults";
import { weekStartOf } from "@/lib/guild-snapshot";
import { WEEK_CLOSE_ACTOR, weekKey, TIERS } from "@/lib/week-close";
import { PARTICIPATION_SHARE, SCORE_WEIGHTS } from "@/lib/server-score";
import { PAYOUT_HOLD_PHRASE } from "@/lib/abuse";
import {
  Page, Section, StatRow, Stat, Table, Tr, Td, Money, Note, Pill, num, AdminLink,
} from "@/components/admin/kit";
import RunWeekClose from "@/components/admin/RunWeekClose";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · The week" };

// The weekly close, and what it did. B87/C16 — the screen that item was missing.
//
// The model is weekly. Until C16 nothing weekly ran at all, and until this page
// nothing weekly could be SEEN: an owner asking "why was I paid $12" had an
// answer buried in a payout note, and an operator asking "did Monday run" had
// no way to tell but to look for rows.
//
// The page is deliberately a RECORD rather than a control panel. There is one
// button and it re-runs a close that is idempotent; everything else is what
// already happened and why.

export default async function WeekPage() {
  const access = await requireSystemFor("/admin/week");
  const db = await getDb();

  const thisWeek = weekStartOf();
  const lastWeek = new Date(thisWeek.getTime() - 7 * 86400_000);

  const [bal, closed, recent] = await Promise.all([
    balances(db),
    db.select({ id: schema.serverPayouts.id }).from(schema.serverPayouts)
      .where(eq(schema.serverPayouts.periodStart, lastWeek)).limit(1),
    // The last eight weeks of pool payouts, grouped. Bounded: a console page
    // that grows with the age of the company is a page that eventually times
    // out, and eight weeks is the window the decay multiplier itself uses.
    db.select({
      periodStart: schema.serverPayouts.periodStart,
      guildId: schema.serverPayouts.guildId,
      guildName: schema.serverPayouts.guildName,
      status: schema.serverPayouts.status,
      note: schema.serverPayouts.note,
      amount: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)`,
    }).from(schema.serverPayouts)
      .innerJoin(schema.serverPayoutLines, eq(schema.serverPayoutLines.payoutId, schema.serverPayouts.id))
      .where(and(
        eq(schema.serverPayouts.requestedBy, WEEK_CLOSE_ACTOR),
        sql`${schema.serverPayouts.periodStart} >= ${new Date(thisWeek.getTime() - 8 * 7 * 86400_000)}`,
      ))
      .groupBy(
        schema.serverPayouts.periodStart, schema.serverPayouts.guildId,
        schema.serverPayouts.guildName, schema.serverPayouts.status, schema.serverPayouts.note,
      )
      .orderBy(desc(schema.serverPayouts.periodStart))
      .limit(200),
  ]);

  const isClosed = closed.length > 0;
  const weeks = [...new Set(recent.map((r) => +new Date(r.periodStart!)))]
    .sort((a, b) => b - a)
    .slice(0, 8);

  return (
    <Page
      title="The week"
      lede="Every Monday the last complete week is closed: the servers that carried a challenge are scored, the server pool is divided between them, and a draft payout is opened for each. Money only moves when a human releases it."
    >
      <StatRow>
        <Stat
          label="Server pool"
          value={bal.server.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          note="Arrived and not yet committed to a week"
        />
        <Stat
          label="Week of"
          value={weekKey(lastWeek)}
          note="The last COMPLETE week — never the one in progress"
        />
        <Stat
          label="Status"
          value={isClosed ? "Closed" : "Open"}
          note={isClosed ? "Payouts have been opened for it" : "Runs Monday, or press the button"}
          tone={isClosed ? "good" : "warn"}
        />
        <Stat
          label="Paid flat"
          value={`${PARTICIPATION_SHARE}%`}
          note="Split evenly between everyone who carried a challenge, placed or not"
        />
      </StatRow>

      <Note tone="info">{PAYOUT_HOLD_PHRASE}</Note>

      <Section
        title="Close the week"
        note="Idempotent — a week that has already been closed is skipped rather than paid twice, and the check is against the payout rows themselves rather than a flag. Safe to press."
      >
        {access.isAdmin
          ? <RunWeekClose week={weekKey(lastWeek)} alreadyClosed={isClosed} />
          : <Note tone="warn">Running the close is admin-only. It also runs itself every Monday.</Note>}
      </Section>

      <Section
        title="How a server is scored"
        note="Every term is percentile-ranked WITHIN a tier, so one outlier cannot own the pool, and a term with no data anywhere in the week is dropped rather than scored as zero for everybody."
      >
        <Table
          cols={[
            { key: "term", label: "Term" },
            { key: "w", label: "Weight", align: "right" },
            { key: "why", label: "Why it is here", secondary: true },
          ]}
          empty="—"
        >
          <Tr key="ex">
            <Td>Exclusive-weighted entrants</Td>
            <Td align="right" mono>{SCORE_WEIGHTS.exclusiveEntrants}</Td>
            <Td secondary>Each entrant counts 1/k across the servers they belong to. Mass-inviting other servers&apos; gamers scores about nothing.</Td>
          </Tr>
          <Tr key="nq">
            <Td>Newly qualified members</Td>
            <Td align="right" mono>{SCORE_WEIGHTS.newlyQualified}</Td>
            <Td secondary>Linked a week AND proved ownership of a game account. Cannot be bought. Replaces growth %.</Td>
          </Tr>
          <Tr key="op">
            <Td>Engaged card opens</Td>
            <Td align="right" mono>{SCORE_WEIGHTS.engagedOpens}</Td>
            <Td secondary>Nothing records this per server yet, so it is DROPPED from the score and its weight redistributed. The close says so when it runs.</Td>
          </Tr>
          <Tr key="cv">
            <Td>Entrant conversion</Td>
            <Td align="right" mono>{SCORE_WEIGHTS.conversion}</Td>
            <Td secondary>Entrants ÷ linked members. The size-neutral term — what a small server should win on.</Td>
          </Tr>
        </Table>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.key} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-xs font-bold capitalize">{t.key}</div>
              <div className="text-[11px] text-muted">
                {t.floor === 0 ? "Any size" : `${num(t.floor)}+ qualified members`}
              </div>
            </div>
          ))}
        </div>
        <Note tone="info">
          A tier decides who a server competes against and <b>nothing else</b>. It is not a rate — the
          per-challenge owner percentage was deleted in C3, and running both would have paid owners
          twice out of one 15% line.
        </Note>
      </Section>

      {weeks.map((w) => {
        const rows = recent.filter((r) => +new Date(r.periodStart!) === w);
        const total = rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);
        return (
          <Section
            key={w}
            title={`Week of ${weekKey(new Date(w))}`}
            note={`${rows.length} server${rows.length === 1 ? "" : "s"} paid · ${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} divided`}
          >
            <Table
              cols={[
                { key: "server", label: "Server" },
                { key: "amount", label: "Amount", align: "right" },
                { key: "status", label: "Status", align: "right" },
                { key: "note", label: "Score", secondary: true },
              ]}
              empty="No server was paid for this week."
            >
              {rows
                .sort((a, b) => Number(b.amount) - Number(a.amount))
                .map((r) => (
                  <Tr key={`${r.guildId}-${w}`}>
                    <Td>
                      <AdminLink href={`/admin/discord/${r.guildId}`}>
                        {r.guildName || r.guildId}
                      </AdminLink>
                    </Td>
                    <Td align="right" mono bold><Money value={Number(r.amount ?? 0)} /></Td>
                    <Td align="right">
                      <Pill tone={r.status === "paid" ? "good" : r.status === "cancelled" ? "bad" : "warn"}>
                        {r.status}
                      </Pill>
                    </Td>
                    <Td secondary>{r.note ?? "—"}</Td>
                  </Tr>
                ))}
            </Table>
          </Section>
        );
      })}

      {weeks.length === 0 && (
        <Section empty="No week has been closed yet. The first close needs money in the server pool and at least one server that carried a challenge with an entrant attributed to it." />
      )}
    </Page>
  );
}
