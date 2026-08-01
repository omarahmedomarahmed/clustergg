"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import { portalSetSlotCover } from "@/app/actions/brand-portal";

// The reporting half of the media buy.
//
// A brand bought four weeks; this is where they find out what the four weeks
// did. It is built around one rule that decides whether any of it is worth
// reading: a number is either COUNTED or it is LABELLED.
//
//   * Counted — servers, people reached, entrants, clicks, the podium. Written
//     down when it happened, never recalculated.
//   * Derived — eCPM and cost per entrant. Counted numbers over the price.
//   * Modelled — media value and ROAS, priced at a benchmark that is printed
//     next to them. A return figure whose benchmark is hidden is one no media
//     buyer should accept, so ours is always visible and always arguable.
//
// Upcoming weeks are editable and finished weeks are not, because a live week's
// cover is already sitting in a message in hundreds of servers.

export type WeekReport = {
  index: number;
  startAt: string;
  endAt: string;
  coverUrl: string | null;
  status: "waiting" | "requested" | "live" | "done";
  challengeId: string | null;
  report: {
    title: string;
    game: string;
    status: string;
    servers: number;
    members: number;
    linked: number;
    entrants: number;
    clicks: number;
    ecpm: number;
    costPerEntrant: number;
    mediaValue: number;
    roas: number;
    spend: number;
    standings: { place: number; name: string; slug: string | null; points: number }[];
    /** The servers it landed in, biggest first. */
    servers_list: { name: string; members: number; linked: number }[];
  } | null;
};

export type CampaignView = {
  id: string;
  game: string;
  status: string;
  startAt: string;
  slots: number;
  total: number;
  weeks: WeekReport[];
  totals: {
    spend: number; prizePool: number; servers: number; members: number;
    entrants: number; clicks: number; ecpm: number; costPerEntrant: number;
    mediaValue: number; roas: number;
  };
  benchmark: { cpm: number; cpc: number; cpe: number };
  complete: boolean;
  testimonials: { name: string; quote: string; slug: string | null; avatarUrl: string | null }[];
};

const n = (x: number) => x.toLocaleString();
const money = (x: number) => `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export default function BrandCampaignReports({
  brandId, keyStr, campaigns,
}: { brandId: string; keyStr: string; campaigns: CampaignView[] }) {
  if (!campaigns.length) return null;
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Your campaigns</h2>
        <p className="mt-1 text-sm text-muted max-w-2xl">
          Every week you bought, what it reached, and what it cost you per thousand people and per
          entrant. Weeks that haven&apos;t started yet are still yours to change.
        </p>
      </div>
      {campaigns.map((c) => <CampaignCard key={c.id} brandId={brandId} keyStr={keyStr} c={c} />)}
    </section>
  );
}

function CampaignCard({ brandId, keyStr, c }: { brandId: string; keyStr: string; c: CampaignView }) {
  const [open, setOpen] = useState<number | null>(
    c.weeks.find((w) => w.status === "live")?.index ?? null,
  );
  const live = c.weeks.filter((w) => w.status === "live").length;
  const done = c.weeks.filter((w) => w.status === "done").length;

  return (
    <div className="glass overflow-hidden">
      {/* ===== Header: which month, what state, what it returned ===== */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">{c.game}</h3>
            <StatusChip complete={c.complete} live={live} />
          </div>
          <div className="mt-0.5 text-xs text-muted tabular-nums">
            {day(c.weeks[0]?.startAt ?? c.startAt)} — {day(c.weeks[c.weeks.length - 1]?.endAt ?? c.startAt)}
            {" · "}{done} of {c.slots} weeks run{" · "}{money(c.total)} paid
          </div>
        </div>
        <div className="shrink-0 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-emerald-200/80">Return on spend</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-200">{c.totals.roas.toFixed(2)}×</div>
          <div className="text-[10px] text-muted">at ${c.benchmark.cpm} CPM · ${c.benchmark.cpe}/entrant</div>
        </div>
      </div>

      {/* ===== Counted delivery ===== */}
      <div className="grid grid-cols-2 gap-px bg-white/8 sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="Servers reached" value={n(c.totals.servers)} />
        <Cell label="People reached" value={n(c.totals.members)} />
        <Cell label="Entrants" value={n(c.totals.entrants)} />
        <Cell label="Clicks" value={n(c.totals.clicks)} />
        <Cell label="Your cost / 1,000" value={c.totals.ecpm ? money(c.totals.ecpm) : "—"} />
        <Cell label="Cost / entrant" value={c.totals.costPerEntrant ? money(c.totals.costPerEntrant) : "—"} />
      </div>

      {/* ===== The four weeks ===== */}
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {c.weeks.map((w) => (
          <WeekCard
            key={w.index} brandId={brandId} keyStr={keyStr} campaignId={c.id} w={w}
            open={open === w.index} onToggle={() => setOpen(open === w.index ? null : w.index)}
          />
        ))}
      </div>

      {/* ===== The open week, in full ===== */}
      {open !== null && c.weeks[open]?.report && (
        <WeekDetail w={c.weeks[open]} benchmark={c.benchmark} />
      )}

      {/* ===== End of month ===== */}
      {c.complete && <MonthReport c={c} />}
    </div>
  );
}

function StatusChip({ complete, live }: { complete: boolean; live: number }) {
  const [text, cls] = complete
    ? ["Complete", "border-white/20 text-muted"]
    : live > 0
      ? ["Live now", "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"]
      : ["Scheduled", "border-cyan-400/45 bg-cyan-500/12 text-cyan-200"];
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${cls}`}>
      {text}
    </span>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#070a1f] px-4 py-3">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}

function WeekCard({
  brandId, keyStr, campaignId, w, open, onToggle,
}: {
  brandId: string; keyStr: string; campaignId: string;
  w: WeekReport; open: boolean; onToggle: () => void;
}) {
  const [cover, setCover] = useState(w.coverUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  // A week that has already gone out cannot be restyled from here: its cover is
  // in a message in every server that received it.
  const editable = w.status === "waiting" || w.status === "requested";

  const upload = async (file: File) => {
    setBusy(true); setMsg(null);
    try {
      const dataUrl = await downscale(file, 1600, 0.88);
      const res = await fetch("/api/brands/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, key: keyStr, dataUrl }),
      });
      const j = await res.json();
      if (!j?.url) { setMsg(j?.error ?? "Upload failed."); return; }
      start(async () => {
        const r = await portalSetSlotCover(brandId, keyStr, campaignId, w.index, j.url);
        if (r?.error) setMsg(r.error); else setCover(j.url);
      });
    } catch { setMsg("Upload failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className={`rounded-xl border p-3 transition ${open ? "border-cyan-400/60 bg-cyan-500/[0.07]" : "border-white/12 bg-black/20"}`}>
      {/* The WHOLE top of the card opens the week, not just the picture.
          Anyone reading this reaches for the week number first, and a card
          where only the image responds reads as broken. */}
      <button
        type="button" onClick={onToggle} disabled={!w.report}
        className="block w-full text-left disabled:cursor-default"
        title={w.report ? "See this week's numbers" : "Nothing to report yet"}
      >
        <span className="flex items-baseline justify-between">
          <span className="text-xs font-bold">Week {w.index + 1}</span>
          <WeekChip status={w.status} />
        </span>
        <span className="mt-1 block text-[11px] tabular-nums text-muted">{day(w.startAt)} — {day(w.endAt)}</span>
        <span
          className="mt-2 block w-full overflow-hidden rounded-lg border border-white/10 bg-black/40"
          style={{ aspectRatio: "1200 / 630" }}
        >
          {cover
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cover} alt="" className="h-full w-full object-cover" />
            : <span className="grid h-full place-items-center text-[10px] text-muted">no cover</span>}
        </span>
      </button>

      {w.report ? (
        <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] tabular-nums">
          <Mini label="reached" value={n(w.report.members)} />
          <Mini label="entrants" value={n(w.report.entrants)} />
        </div>
      ) : editable ? (
        <label className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/20 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-cyan-400/50 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <Icon name="plus" size={11} /> {busy ? "Uploading…" : cover ? "Replace cover" : "Add cover"}
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
      ) : null}
      {msg && <p className="mt-1 text-[10px] text-amber-300">{msg}</p>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/30 px-2 py-1">
      <div className="font-bold">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}

function WeekChip({ status }: { status: WeekReport["status"] }) {
  const map: Record<WeekReport["status"], [string, string]> = {
    waiting: ["queued", "text-muted"],
    requested: ["in review", "text-amber-300"],
    live: ["live", "text-emerald-300"],
    done: ["finished", "text-cyan-300"],
  };
  const [text, cls] = map[status];
  return <span className={`text-[9px] uppercase tracking-widest ${cls}`}>{text}</span>;
}

function WeekDetail({ w, benchmark }: { w: WeekReport; benchmark: { cpm: number; cpc: number; cpe: number } }) {
  const r = w.report!;
  return (
    <div className="border-t border-white/10 bg-black/25 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-bold">Week {w.index + 1} — {r.title}</h4>
        <span className="text-xs text-muted tabular-nums">{money(r.spend)} · {day(w.startAt)} — {day(w.endAt)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="Servers it landed in" value={n(r.servers)} />
        <Box label="People in those servers" value={n(r.members)} note="counted when it posted" />
        <Box label="Could enter (linked)" value={n(r.linked)} />
        <Box label="Entered" value={n(r.entrants)} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="Clicks while it ran" value={n(r.clicks)} />
        <Box label="Your cost / 1,000" value={r.ecpm ? money(r.ecpm) : "—"} />
        <Box label="Cost / entrant" value={r.costPerEntrant ? money(r.costPerEntrant) : "—"} />
        <Box label="Return on spend" value={`${r.roas.toFixed(2)}×`} accent />
      </div>

      {r.servers_list.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-muted hover:text-ink">
            Which servers it landed in ({r.servers_list.length})
          </summary>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/10">
            {r.servers_list.map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-white/6 px-3 py-2 text-sm last:border-0">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 tabular-nums text-xs text-muted">
                  {n(s.members)} members · {n(s.linked)} could enter
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {r.standings.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-widest text-muted">Who won your week</div>
          <div className="mt-2 space-y-1">
            {r.standings.map((s) => (
              <div key={s.place} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-200">{s.place}</span>
                  {s.slug
                    ? <a href={`/u/${s.slug}`} className="font-semibold hover:text-cyan-300">{s.name}</a>
                    : <span className="font-semibold">{s.name}</span>}
                </span>
                <span className="tabular-nums text-muted">{n(s.points)} pts</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Each of them is holding a trophy with your logo on it, on a profile they built themselves.
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        People reached is counted at the moment the challenge posted — the servers it landed in and how many
        members each had — and never recalculated. Return on spend prices that delivery at the going rate for
        gaming inventory: <b className="text-ink">${benchmark.cpm} per thousand reached</b>,{" "}
        <b className="text-ink">${benchmark.cpc} per click</b>, and{" "}
        <b className="text-ink">${benchmark.cpe} per entrant</b> — an entrant linked an account and played a
        week under your name, which is worth more than a view. It does not count the prize money that reached
        players, which is the product rather than a rebate.
      </p>
    </div>
  );
}

function Box({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${accent ? "border-emerald-400/35 bg-emerald-500/10" : "border-white/12 bg-black/25"}`}>
      <div className={`text-xl font-bold tabular-nums ${accent ? "text-emerald-200" : ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      {note && <div className="mt-0.5 text-[10px] text-muted/70">{note}</div>}
    </div>
  );
}

function MonthReport({ c }: { c: CampaignView }) {
  return (
    <div className="border-t border-white/10 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-5">
      <div className="flex items-center gap-2">
        <Icon name="chart" size={16} className="text-cyan-300" />
        <h4 className="font-bold">Your month on {c.game}</h4>
      </div>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        Four challenges, {n(c.totals.members)} people reached across {n(c.totals.servers)} servers,{" "}
        {n(c.totals.entrants)} of them competing for {money(c.totals.prizePool)} of your prize money.
        Every one of the four was featured on the Sunday show.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="Paid" value={money(c.totals.spend)} />
        <Box label="Media value delivered" value={money(c.totals.mediaValue)} note={`at $${c.benchmark.cpm} CPM`} />
        <Box label="Return on spend" value={`${c.totals.roas.toFixed(2)}×`} accent />
        <Box label="To players" value={money(c.totals.prizePool)} />
      </div>

      {c.testimonials.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-widest text-muted">What players said</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {c.testimonials.map((t, i) => (
              <figure key={i} className="rounded-xl border border-white/12 bg-black/25 p-4">
                <blockquote className="text-sm leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-2 flex items-center gap-2 text-xs text-muted">
                  {t.avatarUrl && /* eslint-disable-next-line @next/next/no-img-element */ (
                    <img src={t.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  )}
                  {t.slug ? <a href={`/u/${t.slug}`} className="hover:text-cyan-300">{t.name}</a> : t.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <a
        href={`/api/brands/report?campaign=${encodeURIComponent(c.id)}`}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold hover:border-cyan-400/50"
      >
        <Icon name="chart" size={12} /> Download this report (CSV)
      </a>
    </div>
  );
}
