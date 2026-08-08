import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { approveRedeem, rejectRedeem, markRedeemPaid, sendRedeem } from "@/app/actions/trophies";
import { payer } from "@/lib/payments";
import { METHOD_OPTIONS } from "@/lib/payouts";
import { vendorBy } from "@/lib/payments/vendors";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";
import {
  Page, Section, StatRow, Stat, Table, Tr, Td, Money, Note, Pill, num, AdminLink, LinkButton,
} from "@/components/admin/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Trophy redemptions" };

// Status tone, in the kit's vocabulary rather than a private colour map. Six
// hex codes in one file was six colours no other admin screen used.
const STATUS_TONE: Record<string, "plain" | "good" | "warn" | "bad" | "info"> = {
  pending: "warn", approved: "info", sent: "info",
  paid: "good", rejected: "bad", cancelled: "plain",
};

const OPEN = ["pending", "approved", "sent"];

// Winners cashing in.
//
// This page used to show staff the routing and account numbers a gamer had
// typed in, behind a "View payment details" disclosure. It doesn't, because
// they aren't collected any more — the gamer chooses where the money goes on
// the payout provider's page after we release it. What's left for staff to do
// is the part that actually needs judgement: is this request legitimate, and
// should the money go out.
export default async function AdminRedeemsPage() {
  await requireSystemFor("/admin/redeems");
  const db = await getDb();
  const { adapter, picked, reason } = await payer("rewards");
  const vendor = vendorBy(adapter.key);

  const rows = await db.select({
    r: schema.trophyRedeems,
    name: schema.users.displayName, slug: schema.users.slug,
    country: schema.users.country, changes: schema.users.payoutChanges,
    joined: schema.users.createdAt,
  }).from(schema.trophyRedeems)
    .innerJoin(schema.users, eq(schema.trophyRedeems.userId, schema.users.id))
    .orderBy(desc(schema.trophyRedeems.createdAt)).limit(100);

  // B37: per-recipient annual totals, on demand.
  //
  // Not a tax filing and not advice — it is the answer to "who did we pay, how
  // much, this year", which is the question that has to be answerable before
  // anybody can file anything. Kept as the WHOLE list rather than pre-filtered
  // by the threshold: the threshold is a number counsel may move, and a report
  // that filters by it cannot answer the question after it moves.
  const { annualRecipients, US_REPORT_THRESHOLD } = await import("@/lib/eligibility");
  const taxYear = new Date().getUTCFullYear();
  const recipients = await annualRecipients(db, taxYear);
  const overLine = recipients.filter((r) => r.overThreshold);

  const awardIds = [...new Set(rows.flatMap(({ r }) => r.awardIds ?? []))];
  const awards = awardIds.length
    ? await db.select({ id: schema.userTrophies.id, name: schema.trophies.name, value: schema.trophies.value })
        .from(schema.userTrophies).innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
        .where(inArray(schema.userTrophies.id, awardIds))
    : [];
  const awardById = new Map(awards.map((a) => [a.id, a]));
  const open = rows.filter(({ r }) => OPEN.includes(r.status));
  const closed = rows.filter(({ r }) => !OPEN.includes(r.status));
  const owed = open.reduce((s, { r }) => s + Number(r.amount), 0);
  const fmt = (d: Date | null) => d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const methodLabel = (k: string) => METHOD_OPTIONS.find((m) => m.key === k)?.label ?? k;

  const card = ({ r, name, slug, country, changes, joined }: (typeof rows)[number]) => {
    // A request from an account that arrived last week is the one to look at
    // twice. Surfaced here rather than left for someone to remember.
    const fresh = joined && Date.now() - new Date(joined).getTime() < 7 * 86400000;
    return (
      <div key={r.id} className="glass p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/u/${slug}`} className="font-bold hover:text-cyan-300">{name} <span className="text-muted font-normal">@{slug}</span></Link>
          <span className="font-black text-emerald-300">
            <Money value={Number(r.amount)} currency={r.currency} />
          </span>
          <Pill tone={STATUS_TONE[r.status] ?? "plain"}>{r.status}</Pill>
          {fresh && <Pill tone="warn">new account</Pill>}
          {Number(changes) >= 3 && <Pill tone="bad">preference locked</Pill>}
          <span className="text-xs text-muted ml-auto">{fmt(r.createdAt)}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {(r.awardIds ?? []).map((id) => {
            const a = awardById.get(id);
            return <span key={id} className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5">{a ? `${a.name} · $${Number(a.value).toLocaleString()}` : "…"}</span>;
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Prefers <b className="text-ink">{methodLabel(r.method).toLowerCase()}</b>{country ? ` · ${country}` : ""}</span>
          {r.providerRef && <span>· {r.providerKey} ref <code className="text-cyan-300">{r.providerRef}</code></span>}
          {r.sentAt && <span>· sent {fmt(r.sentAt)}</span>}
          {r.gamerConfirmedAt && <span className="text-emerald-300 inline-flex items-center gap-1"><Icon name="check" size={11} />collected {fmt(r.gamerConfirmedAt)}</span>}
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-3">
          {r.status === "pending" && (
            <>
              <form action={approveRedeem.bind(null, r.id)}>
                <button className="glow-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white">Approve</button>
              </form>
              <form action={rejectRedeem.bind(null, r.id)}>
                <button className="rounded-full border border-rose-400/40 text-rose-300 px-4 py-1.5 text-sm hover:bg-rose-500/10">Reject</button>
              </form>
            </>
          )}
          {r.status === "approved" && (
            <>
              <form action={async () => { "use server"; await sendRedeem(r.id); }}>
                <button className="money-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white">
                  Release {adapter.key === "manual" ? "for manual transfer" : `via ${vendor?.name ?? adapter.key}`}
                </button>
              </form>
              <form action={rejectRedeem.bind(null, r.id)}>
                <button className="rounded-full border border-rose-400/40 text-rose-300 px-4 py-1.5 text-sm hover:bg-rose-500/10">Cancel &amp; return trophies</button>
              </form>
            </>
          )}
          {r.status === "sent" && (
            <>
              {r.collectUrl && (
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200">
                  Collection link issued — the gamer chooses their own payout
                </span>
              )}
              <form action={markRedeemPaid.bind(null, r.id)} className="flex flex-wrap items-end gap-3">
                <ImageUpload name="proofUrl" label="Confirmation (optional)" aspect="16/9" maxDim={1400} scope="misc" previewWidth={110} />
                <button className="money-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white">
                  Mark paid
                </button>
              </form>
            </>
          )}
          {r.status === "paid" && r.proofUrl && (
            <a href={r.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:underline inline-flex items-center gap-1">
              <Icon name="check" size={13} /> Payment confirmation
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <Page
      title="Trophy redemptions"
      lede="Approve → release → the gamer collects. We never hold their bank details: releasing hands the amount to the payout provider, which issues a link the gamer opens to choose exactly how they want the money. The trophies leave their shelf when it is collected."
      actions={<LinkButton href="/admin/payments">Payment providers</LinkButton>}
    >
      <StatRow>
        <Stat
          label="Open requests"
          value={owed.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          note={`${open.length} waiting on somebody here`}
          tone={open.length > 0 ? "warn" : "plain"}
        />
        <Stat label="Paid this year" value={num(recipients.length)} note={`Distinct recipients in ${taxYear}`} />
        <Stat
          label={`Over $${US_REPORT_THRESHOLD.toLocaleString()}`}
          value={num(overLine.length)}
          note="Where US information reporting typically begins"
          tone={overLine.length > 0 ? "warn" : "plain"}
        />
        <Stat label="Provider" value={vendor?.name ?? adapter.key} note={reason ?? "connected"} tone={reason ? "warn" : "good"} />
      </StatRow>

      {reason && (
        <Note tone="warn">
          <b>{vendor?.name ?? adapter.key}</b> — {reason}
          {picked !== adapter.key && <> (you selected {picked})</>}. Releases will not reach anybody until
          this is resolved.
        </Note>
      )}

      {/* What we have paid this year, per person. Collapsed, because it is a
          reference rather than a queue — but never hidden, because "who did we
          pay this year" has to be answerable before anything can be filed. */}
      {recipients.length > 0 && (
        <details className="glass p-5 sm:p-6">
          <summary className="cursor-pointer text-sm font-semibold">
            Paid in {taxYear} — {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
            {overLine.length > 0 && <span className="ml-2"><Pill tone="warn">{overLine.length} over ${US_REPORT_THRESHOLD.toLocaleString()}</Pill></span>}
          </summary>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted">
            Counted from the date the money MOVED, not the date it was requested — a request approved in
            December and paid in January belongs to January. The whole list is kept rather than pre-filtered
            by the threshold: the threshold is a number counsel may move, and a report that filters by it
            cannot answer the question after it moves. What gets filed, and by whom, is for counsel.
          </p>
          <div className="mt-3">
            <Table
              cols={[
                { key: "who", label: "Recipient" },
                { key: "country", label: "Country", secondary: true },
                { key: "total", label: `Paid in ${taxYear}`, align: "right" },
              ]}
              empty="Nobody has been paid this year."
            >
              {recipients.map((r) => (
                <Tr key={r.userId} tone={r.overThreshold ? "warn" : undefined}>
                  <Td><AdminLink href={`/u/${r.slug}`}>{r.name}</AdminLink></Td>
                  <Td secondary>{r.country ?? "—"}</Td>
                  <Td align="right" mono bold><Money value={r.total} /></Td>
                </Tr>
              ))}
            </Table>
          </div>
        </details>
      )}

      <Section
        title="Waiting on you"
        note="Approve, then release. Rejecting returns the trophies to the shelf they came from — nothing is destroyed by a decision on this page."
        empty="Nothing is waiting. Every request has been paid, rejected or cancelled."
      >
        {open.length > 0 ? <div className="space-y-4">{open.map(card)}</div> : null}
      </Section>

      {closed.length > 0 && (
        <Section title="History" note="Settled requests, newest first.">
          <div className="space-y-4">{closed.map(card)}</div>
        </Section>
      )}
    </Page>
  );
}
