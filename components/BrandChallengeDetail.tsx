"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import type {
  BrandChallengeDetail as Detail, BrandEntrant, ScoringEvent,
} from "@/lib/brand-challenge-detail";

// One sponsored challenge, opened up.
//
// What a brand had before was the cover art and a three-name podium. The three
// names are the least useful part: a brand pays for an audience, and the
// audience is the whole field — where they came from, which server introduced
// them, and whether they played all week or turned up once.

const num = (n: number) => n.toLocaleString();

const TIER_RING: Record<string, string> = {
  legendary: "border-amber-300/70 shadow-[0_0_24px_-6px_rgba(252,211,77,.6)]",
  gold: "border-amber-400/50",
  silver: "border-slate-300/50",
  bronze: "border-orange-400/40",
};

const PLACE_LABEL = ["Challenge trophy", "1st place", "2nd place", "3rd place"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A trophy, big enough to actually look at, and openable full size. */
function TrophyCard({ t, onOpen }: { t: Detail["trophies"][number]; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className={`group rounded-2xl border bg-black/25 p-3 text-left transition hover:bg-black/40 ${TIER_RING[t.tier] ?? "border-white/12"}`}>
      <div className="relative mb-2 aspect-square overflow-hidden rounded-xl bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.imageUrl} alt={t.name} className="h-full w-full object-contain p-2 transition group-hover:scale-105" />
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/80">
          <Icon name="search" size={9} /> View
        </span>
      </div>
      <div className="text-xs font-bold leading-tight">{t.name}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
        <span className="uppercase tracking-wider">{PLACE_LABEL[t.place] ?? "Trophy"}</span>
        {t.value > 0 && <span>· ${num(t.value)}</span>}
      </div>
      {/* The whole point of a branded trophy is that it says who it's from. */}
      {t.brandName && (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200">
          <Icon name="spark" size={9} /> {t.brandName} branded
        </div>
      )}
    </button>
  );
}

function ScoringPanel({ events, total }: { events: ScoringEvent[]; total: number }) {
  if (events.length === 0) {
    return <p className="px-3 py-2 text-[11px] text-muted">No scoring events recorded yet — their first sync during the challenge writes one.</p>;
  }
  const peak = Math.max(...events.map((e) => e.total), 1);
  return (
    <div className="space-y-2 px-3 pb-3">
      {/* A shape, not a chart library: how their points accumulated over the run. */}
      <div className="flex h-16 items-end gap-0.5">
        {events.map((e, i) => (
          <div key={i} className="flex-1 rounded-t bg-cyan-400/40" style={{ height: `${Math.max(4, (e.total / peak) * 100)}%` }}
            title={`${fmtDate(e.at)} · +${num(e.points)} → ${num(e.total)}`} />
        ))}
      </div>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-black/60">
            <tr className="text-muted"><th className="p-1.5 text-left">When</th><th className="p-1.5 text-left">Event</th><th className="p-1.5 text-right">Points</th><th className="p-1.5 text-right">Running</th></tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="p-1.5 text-muted">{new Date(e.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="p-1.5">{e.type.replace(/_/g, " ")}</td>
                <td className="p-1.5 text-right text-emerald-300">+{num(e.points)}</td>
                <td className="p-1.5 text-right font-semibold">{num(e.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-right text-[11px] text-muted">Final: <b className="text-ink">{num(total)}</b> points</div>
    </div>
  );
}

export default function BrandChallengeDetail({
  detail, brandId, keyStr, backHref,
}: {
  detail: Detail; brandId: string; keyStr: string; backHref: string;
}) {
  const [zoom, setZoom] = useState<Detail["trophies"][number] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [scoring, setScoring] = useState<Record<string, { total: number; events: ScoringEvent[] } | "loading" | "error">>({});
  const [source, setSource] = useState<"all" | "discord" | "web">("all");

  const shown = detail.entrants.filter((e) => source === "all" || e.joinedFrom === source);
  const fromDiscord = detail.entrants.filter((e) => e.joinedFrom === "discord").length;
  const countries = new Set(detail.entrants.map((e) => e.country).filter(Boolean)).size;

  async function toggle(e: BrandEntrant) {
    if (open === e.userId) { setOpen(null); return; }
    setOpen(e.userId);
    if (scoring[e.userId]) return;
    setScoring((s) => ({ ...s, [e.userId]: "loading" }));
    try {
      const url = `/api/brands/scoring?brand=${encodeURIComponent(brandId)}&key=${encodeURIComponent(keyStr)}`
        + `&challenge=${encodeURIComponent(detail.challengeId)}&gamer=${encodeURIComponent(e.userId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setScoring((s) => ({ ...s, [e.userId]: { total: data.total, events: data.events } }));
    } catch {
      setScoring((s) => ({ ...s, [e.userId]: "error" }));
    }
  }

  const chip = (v: typeof source, label: string) => (
    <button type="button" onClick={() => setSource(v)}
      className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition ${
        source === v ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <a href={backHref} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <Icon name="chevronLeft" size={13} /> Back to the campaign
      </a>

      {/* The challenge itself */}
      <div className="glass overflow-hidden">
        {detail.coverUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={detail.coverUrl} alt="" className="h-32 w-full object-cover" />
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-xl font-bold">{detail.title}</h2>
            <span className="text-xs uppercase tracking-wider text-muted">{detail.game}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              detail.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-muted"}`}>
              {detail.status}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted">{fmtDate(detail.startAt)} → {fmtDate(detail.endAt)}</div>
          {detail.description && <p className="mt-2 max-w-2xl text-sm text-muted">{detail.description}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Entrants" value={num(detail.entrants.length)} />
            <Stat label="Came via Discord" value={num(fromDiscord)} />
            <Stat label="Countries" value={num(countries)} />
            <Stat label="Servers reached" value={num(detail.servers.length)} />
          </div>

          {detail.entryRules.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] uppercase tracking-widest text-muted">Who could enter</div>
              <ul className="space-y-0.5 text-xs">
                {detail.entryRules.map((r) => (
                  <li key={r} className="flex items-start gap-1.5"><Icon name="check" size={11} className="mt-0.5 text-emerald-300" /> {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Trophies — including the branded ones, once staff attach them */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 font-bold"><Icon name="trophy" size={16} className="text-amber-300" /> The prizes</h3>
        {detail.trophies.length === 0 ? (
          <div className="glass p-4 text-sm text-muted">
            No trophies attached yet. Generic cups go on at launch; your own branded trophy replaces them the moment we make it.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {detail.trophies.map((t) => <TrophyCard key={`${t.id}-${t.place}`} t={t} onOpen={() => setZoom(t)} />)}
          </div>
        )}
        {detail.prizeDescription && <p className="mt-2 text-xs text-muted">{detail.prizeDescription}</p>}
      </section>

      {/* The field — not "who won the week" */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold">
            <Icon name="users" size={16} className="text-cyan-300" /> Everyone who entered
            <span className="text-xs font-normal text-muted">({num(detail.entrants.length)})</span>
          </h3>
          <div className="flex gap-1.5">
            {chip("all", "All")}
            {chip("discord", `Discord (${num(fromDiscord)})`)}
            {chip("web", `Web (${num(detail.entrants.length - fromDiscord)})`)}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="glass p-6 text-center text-sm text-muted">Nobody in this filter.</div>
        ) : (
          <div className="glass divide-y divide-white/5 overflow-hidden">
            {shown.map((e) => {
              const s = scoring[e.userId];
              return (
                <div key={e.userId}>
                  <button type="button" onClick={() => toggle(e)} data-entrant={e.userId}
                    className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-white/[0.03]">
                    <span className={`w-8 shrink-0 text-center text-sm font-bold ${
                      e.place === 1 ? "text-amber-300" : e.place === 2 ? "text-slate-200" : e.place === 3 ? "text-orange-300" : "text-muted"}`}>
                      {e.place}
                    </span>
                    {e.avatarUrl
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={e.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      : <span className="h-8 w-8 shrink-0 rounded-full bg-white/10" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{e.name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {e.inGameName && <>{e.inGameName} · </>}
                        {e.joinedFrom === "discord" ? (e.guildName ?? "Discord") : "clustergg.com"}
                        {e.country && <> · {e.country}</>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold">{num(e.points)}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-muted">points</span>
                    </span>
                    <Icon name={open === e.userId ? "chevronDown" : "chevronRight"} size={14} className="shrink-0 text-muted" />
                  </button>
                  {open === e.userId && (
                    <div className="border-t border-white/5 bg-black/20">
                      {s === "loading" && <p className="px-3 py-3 text-[11px] text-muted">Loading their scoring history…</p>}
                      {s === "error" && <p className="px-3 py-3 text-[11px] text-rose-300">Couldn&apos;t load that history. Try again.</p>}
                      {s && s !== "loading" && s !== "error" && <ScoringPanel events={s.events} total={s.total} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Where it landed */}
      {detail.servers.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-bold"><Icon name="discord" size={16} className="text-[#5865f2]" /> Servers it was announced in</h3>
          <div className="glass grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {detail.servers.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-muted">{num(s.members)} members</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Trophy at full size */}
      {zoom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoom(null)} role="presentation">
          <div className="max-w-lg" onClick={(ev) => ev.stopPropagation()} role="presentation">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.imageUrl} alt={zoom.name} className="max-h-[70vh] w-full object-contain" />
            <div className="mt-3 text-center">
              <div className="font-bold">{zoom.name}</div>
              <div className="text-xs text-muted">
                {PLACE_LABEL[zoom.place] ?? "Trophy"} · {zoom.tier}
                {zoom.brandName && <> · {zoom.brandName} branded</>}
              </div>
              <button type="button" onClick={() => setZoom(null)}
                className="ghost-btn mt-3 rounded-full px-4 py-1.5 text-xs">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
