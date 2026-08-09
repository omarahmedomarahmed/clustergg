import { requireSystemFor } from "@/lib/departments";
import { getDb } from "@/lib/db";
import { campaignConsole, AT_RISK_DAYS, type ConsoleCampaign } from "@/lib/campaign-console";
import { Page, Section, StatRow, Stat, Note, Pill, AdminLink } from "@/components/admin/kit";
import Link from "next/link";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Campaigns" };

// Every campaign, and whether it is actually happening. B102.
//
// A campaign is the thing a brand buys: one to four weekly challenges, one
// bill. Until this screen the only way to see one was to open the brand it
// belongs to, and the only way to see all of them was not to.
//
// ===== IT IS SORTED BY RISK, NOT BY DATE =====
//
// The question that costs money is "which weeks did somebody pay for that are
// not going to happen". A slot with no challenge two days before it opens is a
// refund and an apology; a week later it is a refund, an apology and a brand
// that does not come back. So the worst is at the top, always, and a campaign
// with nothing wrong says nothing at all.
//
// ===== EVERY SLOT IS A BOX, AND AN EMPTY BOX IS A JOB =====
//
// The row is the campaign; the boxes are its weeks. An operator scanning this
// page is looking for gaps, and a gap in a row of boxes is visible from across
// a room in a way "3 of 4 slots filled" is not.

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function CampaignsConsolePage() {
  await requireSystemFor("/admin/campaigns");
  const db = await getDb();
  const rows = await campaignConsole(db);

  const needing = rows.filter((c) => c.warning);
  const invoiced = rows.reduce((a, c) => a + c.invoiced, 0);
  const paid = rows.reduce((a, c) => a + c.paid, 0);
  const emptySlots = rows.reduce((a, c) => a + c.slotsEmpty, 0);

  return (
    <Page
      title="Campaigns"
      lede="What every brand bought, week by week, and which of those weeks has nothing behind it yet. Sorted by what is most likely to become a refund."
    >
      <StatRow>
        <Stat label="Campaigns" value={String(rows.length)} note="Newest hundred" />
        <Stat
          label="Need attention" value={String(needing.length)}
          tone={needing.length > 0 ? "warn" : "good"}
          note={needing.length ? "Shown first, worst first" : "Nothing is at risk"}
        />
        <Stat
          label="Weeks with nothing built" value={String(emptySlots)}
          tone={emptySlots > 0 ? "warn" : "good"}
          note="Slots with no challenge behind them"
        />
        <Stat label="Invoiced" value={usd(invoiced)} note="Across every campaign here" />
        <Stat
          label="Paid" value={usd(paid)}
          tone={paid >= invoiced - 0.005 ? "good" : "warn"}
          note={paid >= invoiced - 0.005 ? "All of it" : usd(invoiced - paid) + " outstanding"}
        />
      </StatRow>

      {rows.length === 0 && (
        <Note>
          No campaigns yet. One appears here the moment a brand buys, or the moment somebody
          builds a sponsored challenge here — every sponsored challenge belongs to a campaign,
          and one is created for it if it does not exist.
        </Note>
      )}

      {/* Nothing wrong is worth SAYING. A console that is silent when it is
          happy and silent when it is broken teaches people to distrust it. */}
      {rows.length > 0 && needing.length === 0 && (
        <Note>
          Every campaign has a challenge behind every week that has opened, and nothing opens in
          the next {AT_RISK_DAYS} days without one. Nothing needs you here.
        </Note>
      )}

      <Section title="Every campaign, worst first">
        <div className="space-y-3">
          {rows.map((c) => <Row key={c.id} c={c} />)}
        </div>
      </Section>
    </Page>
  );
}

function Row({ c }: { c: ConsoleCampaign }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      c.warning ? "border-amber-400/35 bg-amber-500/[0.06]" : "border-white/10 bg-black/25"
    }`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-bold">
          <AdminLink href={`/admin/brands/${c.brandId}`}>{c.brandName}</AdminLink>
        </span>
        <span className="text-xs text-muted">{c.games.join(" · ")}</span>
        <Pill>{c.status}</Pill>
        <span className="text-xs text-muted">from {fmtDate(c.startAt)}</span>
        <span className="ml-auto text-sm font-black tabular-nums">{usd(c.total)}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${
          c.invoiced > 0 && c.paid >= c.invoiced - 0.005
            ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
            : "border border-white/15 text-muted"
        }`}>
          {c.invoiced === 0 ? "Uninvoiced" : c.paid >= c.invoiced - 0.005 ? "Paid" : "Unpaid"}
        </span>
      </div>

      {/* The weeks, as boxes. A gap in a row of boxes is visible from across a
          room in a way "3 of 4 slots filled" is not. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.slots.map((s) => {
          const tone = s.challengeId
            ? s.status === "done"
              ? "border-white/12 bg-black/30 text-muted"
              : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
            : s.atRisk
              ? "border-amber-400/50 bg-amber-500/15 text-amber-100"
              : "border-white/12 bg-black/30 text-muted";
          const inner = (
            <>
              <span className="text-[10px] uppercase tracking-widest opacity-70">
                Week {s.index + 1} · {fmtDate(s.startAt)}
              </span>
              <span className="mt-0.5 block text-xs font-bold">{s.game}</span>
              <span className="mt-0.5 block text-[10px] opacity-80">
                {s.challengeId ? s.status : s.atRisk ? "nothing built" : "empty"}
              </span>
            </>
          );
          return s.challengeId ? (
            <Link
              key={s.index}
              href={`/admin/challenges/${s.challengeId}`}
              className={`min-w-[8.5rem] rounded-xl border px-3 py-2 transition hover:border-white/30 ${tone}`}
            >
              {inner}
            </Link>
          ) : (
            <div key={s.index} className={`min-w-[8.5rem] rounded-xl border px-3 py-2 ${tone}`}>
              {inner}
            </div>
          );
        })}
      </div>

      {c.warning && (
        <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-amber-200">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          <span>{c.warning}</span>
        </p>
      )}
    </div>
  );
}
